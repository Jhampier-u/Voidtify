import { SpotifyApiError } from "@/lib/spotify-core";

/**
 * Hasta cuándo no se vuelve a pedir, por familia de endpoint.
 *
 * Las cuotas de Spotify no son una sola: `/search` puede estar disponible
 * mientras `/tracks/{id}` contesta 429 con su propio `Retry-After`. Por eso la
 * espera se guarda por clave y no como un interruptor global.
 */
export type Pausas = Record<string, number>;

/** Espera que se asume cuando Spotify no dice cuánto. */
const ESPERA_A_CIEGAS_S = 60;

/**
 * Segundos que Spotify pide esperar, o null si el error no es una cuota.
 *
 * Un 403 o un fallo de red no se arreglan esperando, y tratarlos como cuota
 * dejaría el relleno parado sin motivo.
 */
export function esperaDe(error: unknown): number | null {
  if (!(error instanceof SpotifyApiError) || error.status !== 429) return null;
  return error.retryAfterSec ?? ESPERA_A_CIEGAS_S;
}

export function enPausa(pausas: Pausas, clave: string, ahoraMs: number): boolean {
  const hasta = pausas[clave];
  return hasta !== undefined && ahoraMs < hasta;
}

/**
 * Anota la espera, quedándose siempre con la más larga.
 *
 * Dos lotes seguidos pueden recibir cuotas distintas del mismo endpoint —el
 * segundo, más corta por haber pasado tiempo—. Acortar la espera vigente con la
 * respuesta más reciente haría volver antes de tiempo.
 */
export function pausar(
  pausas: Pausas,
  clave: string,
  segundos: number,
  ahoraMs: number,
): void {
  const hasta = ahoraMs + Math.max(0, segundos) * 1000;
  pausas[clave] = Math.max(pausas[clave] ?? 0, hasta);
}

/** Cuánto queda de espera, en segundos, o 0 si no hay ninguna. */
export function quedanSegundos(
  pausas: Pausas,
  clave: string,
  ahoraMs: number,
): number {
  const hasta = pausas[clave];
  if (hasta === undefined || ahoraMs >= hasta) return 0;
  return Math.ceil((hasta - ahoraMs) / 1000);
}

/**
 * Las esperas del proceso, compartidas por todas las capturas.
 *
 * Van en memoria y no en la base a propósito: una cuota dura minutos y el
 * servidor vive días, así que el proceso es el sitio natural. Guardarla exigiría
 * una columna nueva, y el DDL de este proyecto solo crea tablas.
 */
const compartidas: Pausas = {};

export function pausasDelProceso(): Pausas {
  return compartidas;
}
