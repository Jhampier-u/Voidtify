import NextAuth from "next-auth";
import Spotify from "next-auth/providers/spotify";

// Auth.js v5 beta sobre este fork de Next no consigue derivar el origen de la
// petición: `parseUrl` cae a su valor por defecto `http://localhost:3000/api/auth`
// y manda ese `redirect_uri` a Spotify. Ni AUTH_URL, ni NEXTAUTH_URL, ni la
// cabecera Host lo corrigen (comprobado los tres). Y Spotify rechaza `localhost`
// en apps nuevas: solo admite la IP de loopback.
//
// Se fija explícitamente. `AUTH_URL` puede venir con o sin la ruta base, así que
// se normaliza a solo el origen.
const PUBLIC_ORIGIN = (process.env.AUTH_URL ?? "http://127.0.0.1:3210")
  .replace(/\/api\/auth\/?$/, "")
  .replace(/\/$/, "");

const SPOTIFY_REDIRECT_URI = `${PUBLIC_ORIGIN}/api/auth/callback/spotify`;

const FETCH_PATCHED = Symbol.for("ledger.spotifyTokenFetchPatched");
type PatchedGlobal = typeof globalThis & { [FETCH_PATCHED]?: true };

/**
 * Impone `SPOTIFY_REDIRECT_URI` en el cuerpo del intercambio de token.
 *
 * Spotify exige que el `redirect_uri` del canje sea idéntico al usado al
 * autorizar. Auth.js construye el suyo desde el origen que cree que tiene, que
 * aquí es siempre el valor por defecto `http://localhost:3000`, así que sin
 * esto el canje falla con `invalid_grant: Invalid redirect URI`.
 *
 * La versión anterior sustituía `localhost` por `127.0.0.1` y dejaba el puerto
 * intacto. Mientras la app vivió en el 3000 coincidía por casualidad; al
 * moverla al 3210 pasó a mandar `127.0.0.1:3000` a un canje autorizado con
 * `127.0.0.1:3210`, y el login dejó de funcionar sin que nada más cambiara.
 * Se escribe el valor entero, que es el mismo que se usa al autorizar: así no
 * hay dos fuentes de verdad que puedan separarse.
 */
function forzarRedirectUri(body: BodyInit | null | undefined): {
  body: BodyInit | null | undefined;
  changed: boolean;
} {
  const aplicar = (texto: string) => {
    const params = new URLSearchParams(texto);
    if (params.get("redirect_uri") === SPOTIFY_REDIRECT_URI) return null;
    params.set("redirect_uri", SPOTIFY_REDIRECT_URI);
    return params;
  };

  if (typeof body === "string") {
    const params = aplicar(body);
    return params ? { body: params.toString(), changed: true } : { body, changed: false };
  }
  if (body instanceof URLSearchParams) {
    const params = aplicar(body.toString());
    return params ? { body: params, changed: true } : { body, changed: false };
  }
  return { body, changed: false };
}

// Guard de idempotencia: sin él, cada recarga de HMR re-evalúa el módulo y
// envuelve el fetch YA parcheado → wrappers anidados que se acumulan.
if (!(globalThis as PatchedGlobal)[FETCH_PATCHED]) {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    if (url?.includes("accounts.spotify.com/api/token")) {
      // El cuerpo puede venir en `init` o dentro de un `Request`.
      if (init?.body != null) {
        const { body, changed } = forzarRedirectUri(init.body);
        if (changed) init = { ...init, body };
      } else if (input instanceof Request) {
        const texto = await input.clone().text();
        const { body, changed } = forzarRedirectUri(texto);
        if (changed) {
          const headers = new Headers(input.headers);
          return origFetch(new Request(input, { body, headers }));
        }
      }
    }

    return origFetch(input, init);
  };
  (globalThis as PatchedGlobal)[FETCH_PATCHED] = true;
}

const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-library-read",
  "user-library-modify",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-top-read",
  "user-read-recently-played",
  "user-follow-read",
  "user-follow-modify",
  "ugc-image-upload",
].join(" ");

async function refreshSpotifyToken(refreshToken: string) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
        ).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error("Failed to refresh Spotify token");
  return (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Spotify({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      checks: ["state"],
      authorization: {
        url: "https://accounts.spotify.com/authorize",
        // `redirect_uri` explícito: sin él Auth.js envía su default con
        // `localhost`, que Spotify rechaza. Ver PUBLIC_ORIGIN arriba.
        params: { scope: SPOTIFY_SCOPES, redirect_uri: SPOTIFY_REDIRECT_URI },
      },
      token: "https://accounts.spotify.com/api/token",
      userinfo: "https://api.spotify.com/v1/me",
    }),
  ],
  callbacks: {
    /**
     * Deja entrar solo al dueño de la instancia.
     *
     * Sin esto, cualquiera que complete el OAuth con su propia cuenta de
     * Spotify entra y ve el historial entero: 272.000 escuchas, con fechas y
     * horas. Escuchando solo en 127.0.0.1 da igual, pero es exactamente la
     * clase de agujero que no se ve venir el día que esto viva en un VPS.
     *
     * Se confía en el primero que entra. Si no hay credenciales guardadas, la
     * instancia está recién montada y quien inicia sesión la reclama; a partir
     * de ahí solo ese identificador vale. Así queda protegida por defecto, sin
     * que haya que configurar nada y sin riesgo de dejar fuera al dueño de una
     * instalación nueva.
     *
     * `ALLOWED_SPOTIFY_USER_IDS` permite fijar la lista a mano, separada por
     * comas, cuando se quiera algo distinto de lo guardado.
     */
    async signIn({ profile }) {
      let guardada: string | null = null;
      try {
        const { getCredentials } = await import("@/lib/credentials");
        guardada = (await getCredentials())?.spotifyUserId ?? null;
      } catch (e) {
        // Fallar cerrado: si no se puede saber de quién es la instancia, no se
        // deja entrar a nadie.
        console.error("[auth] no se pudo leer la identidad guardada", e);
        return false;
      }

      const { decidirAcceso } = await import("@/lib/acceso");
      const decision = decidirAcceso(
        process.env.ALLOWED_SPOTIFY_USER_IDS,
        guardada,
        (profile as { id?: string } | undefined)?.id,
      );

      if (!decision.permitir) {
        console.warn(`[auth] acceso rechazado (${decision.motivo}).`);
      }
      return decision.permitir;
    },

    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = (account.expires_at ?? 0) * 1000;

        // Persistir el refresh token para que el cron pueda operar sin cookie.
        // El import es dinámico a propósito: `@/db` arrastra better-sqlite3
        // (módulo nativo) y no debe acabar en ningún bundle que no sea Node.
        // Un fallo aquí no debe impedir el login: la app sigue funcionando por
        // navegador y /ajustes avisará de que la captura no está configurada.
        if (account.refresh_token) {
          try {
            const { saveCredentials } = await import("@/lib/credentials");
            await saveCredentials({
              spotifyUserId:
                (profile as { id?: string } | undefined)?.id ?? "me",
              refreshToken: account.refresh_token,
              accessToken: account.access_token ?? null,
              expiresAt: (account.expires_at ?? 0) * 1000,
            });
          } catch (e) {
            console.error("[auth] no se pudieron guardar las credenciales", e);
          }
        }

        return token;
      }

      if (Date.now() < (token.expiresAt as number) - 60_000) {
        return token;
      }

      try {
        const refreshed = await refreshSpotifyToken(
          token.refreshToken as string,
        );
        token.accessToken = refreshed.access_token;
        token.expiresAt = Date.now() + refreshed.expires_in * 1000;
        if (refreshed.refresh_token) token.refreshToken = refreshed.refresh_token;

        // El refresco por navegador y el del cron eran dos verdades separadas.
        // Spotify puede rotar el `refresh_token` al canjearlo, y cuando lo hacía
        // por esta rama la fila de `spotify_credentials` se quedaba con el
        // anterior: la captura seguía intentándolo hasta que Spotify lo
        // rechazaba, y moría sin que nadie hubiera tocado nada.
        try {
          const { updateAccessToken } = await import("@/lib/credentials");
          await updateAccessToken(
            refreshed.access_token,
            Date.now() + refreshed.expires_in * 1000,
            refreshed.refresh_token,
          );
        } catch (e) {
          // No es motivo para tumbar la sesión del navegador, que funciona sin
          // la base. Se registra y `/ajustes` mostrará que la captura falla.
          console.error("[auth] no se pudo propagar el token refrescado", e);
        }

        return token;
      } catch (e) {
        console.error("Token refresh failed", e);
        // No propagar el accessToken caduco: quien no revise `error` usaría un
        // token vencido y recibiría 401.
        return { ...token, accessToken: undefined, error: "RefreshTokenError" };
      }
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.error = token.error as string | undefined;
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: string;
  }
}

// Auth.js v5: `next-auth/jwt` solo reexporta `@auth/core/jwt` (donde vive
// `interface JWT`). Augmentar el reexport dispara TS2664 cuando el módulo
// `next-auth` ya está importado + el plugin de Next; se augmenta el módulo
// fuente y la ampliación se propaga a `next-auth/jwt` igual.
declare module "@auth/core/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: string;
  }
}
