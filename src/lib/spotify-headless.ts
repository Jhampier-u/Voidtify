import "server-only";
import { spotifyRequest } from "./spotify-core";
import { getCredentials, updateAccessToken } from "./credentials";
import { conTokenRenovable } from "./reintentar-401";

/** Margen antes de la expiración para no usar un token a punto de caducar. */
const MARGEN_MS = 60_000;

/** Lanzado cuando no hay credenciales guardadas: hay que entrar por navegador. */
export class SinCredencialesError extends Error {
  constructor() {
    super(
      "No hay credenciales guardadas. Inicia sesión en la app desde el navegador " +
        "para habilitar la captura en segundo plano.",
    );
    this.name = "SinCredencialesError";
  }
}

/** Lanzado cuando Spotify rechaza el refresh token (revocado o inválido). */
export class TokenRevocadoError extends Error {
  constructor(detalle: string) {
    super(`El refresh token fue rechazado por Spotify: ${detalle}`);
    this.name = "TokenRevocadoError";
  }
}

async function refrescar(refreshToken: string): Promise<string> {
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

  const cuerpo = await res.text();
  if (!res.ok) {
    // invalid_grant significa token revocado: no tiene sentido reintentar.
    if (res.status === 400 && cuerpo.includes("invalid_grant")) {
      throw new TokenRevocadoError(cuerpo);
    }
    throw new Error(`Fallo al refrescar el token: ${res.status} ${cuerpo}`);
  }

  const datos = JSON.parse(cuerpo) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  await updateAccessToken(
    datos.access_token,
    Date.now() + datos.expires_in * 1000,
    datos.refresh_token,
  );

  return datos.access_token;
}

/**
 * Token para la captura, del almacén o recién pedido.
 *
 * `forzar` salta el guardado aunque no haya caducado: es la salida para un 401,
 * porque un token puede dejar de valer antes de su fecha.
 */
async function accessToken(forzar = false): Promise<string> {
  const cred = await getCredentials();
  if (!cred) throw new SinCredencialesError();

  if (
    !forzar &&
    cred.accessToken &&
    cred.expiresAt &&
    Date.now() < cred.expiresAt - MARGEN_MS
  ) {
    return cred.accessToken;
  }

  return refrescar(cred.refreshToken);
}

/**
 * Petición a la Web API sin sesión de navegador, para el cron.
 *
 * Comparte con `spotifyFetch` todo el rate limiting y el backoff: lo único que
 * cambia es de dónde sale el token.
 */
export async function spotifyFetchHeadless<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return conTokenRenovable(accessToken, (token) =>
    spotifyRequest<T>(token, path, init),
  );
}
