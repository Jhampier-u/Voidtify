import NextAuth from "next-auth";
import Spotify from "next-auth/providers/spotify";

// Auth.js v5 + Next.js sometimes computes the callback origin as `localhost`
// during the token exchange even when the request came in via 127.0.0.1.
// Spotify rejects new apps with localhost redirect URIs, so we patch the
// outgoing token request body to use 127.0.0.1 — matching what was sent in
// the authorize step and what's registered in the Spotify dashboard.
const FETCH_PATCHED = Symbol.for("ledger.spotifyTokenFetchPatched");
type PatchedGlobal = typeof globalThis & { [FETCH_PATCHED]?: true };

/**
 * Reescribe `localhost` por `127.0.0.1` en el cuerpo del intercambio de token.
 *
 * Spotify exige que el `redirect_uri` del canje sea idéntico al usado al
 * autorizar. Como Auth.js construye el suyo con `localhost` (ver PUBLIC_ORIGIN
 * más abajo) y nosotros autorizamos con la IP de loopback, sin esto el canje
 * falla con `invalid_grant: Invalid redirect URI`.
 *
 * El cuerpo llega como `URLSearchParams`, no como cadena — la versión anterior
 * de este parche solo contemplaba cadenas y por eso nunca llegaba a actuar.
 */
function rewriteLoopback(body: BodyInit | null | undefined): {
  body: BodyInit | null | undefined;
  changed: boolean;
} {
  if (typeof body === "string" && body.includes("localhost")) {
    return { body: body.replaceAll("localhost", "127.0.0.1"), changed: true };
  }
  if (body instanceof URLSearchParams) {
    const texto = body.toString();
    if (texto.includes("localhost")) {
      return {
        body: new URLSearchParams(texto.replaceAll("localhost", "127.0.0.1")),
        changed: true,
      };
    }
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
        const { body, changed } = rewriteLoopback(init.body);
        if (changed) init = { ...init, body };
      } else if (input instanceof Request) {
        const texto = await input.clone().text();
        if (texto.includes("localhost")) {
          const headers = new Headers(input.headers);
          return origFetch(
            new Request(input, {
              body: texto.replaceAll("localhost", "127.0.0.1"),
              headers,
            }),
          );
        }
      }
    }

    return origFetch(input, init);
  };
  (globalThis as PatchedGlobal)[FETCH_PATCHED] = true;
}

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
