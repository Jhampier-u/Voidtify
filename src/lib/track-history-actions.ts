"use server";

import { db } from "@/db";
import { requireSession } from "./require-session";
import { trackKey } from "./stats/normalize";
import { getTrackHistory, type TrackHistory } from "./stats/track-history";

export type EntradaCancion = {
  uri: string;
  artista: string;
  titulo: string;
};

/** Historia indexada por URI, que es como la identifica la tabla de playlist. */
export type HistoriaPorUri = Record<string, TrackHistory>;

/**
 * Cruza las canciones de una playlist con tu historial de escucha.
 *
 * La clave de cruce se calcula aquí y no en el cliente: es la misma
 * normalización que usa el resto de las estadísticas, y tenerla en un solo
 * sitio evita que dos versiones se separen y dejen de casar.
 *
 * Devuelve solo las que tienen historia. Las ausentes se distinguen así de las
 * que suman cero, que no es lo mismo: una nunca sonó y la otra sonó por debajo
 * del umbral.
 */
export async function getHistoriaDeCanciones(
  entradas: EntradaCancion[],
): Promise<HistoriaPorUri> {
  await requireSession();

  const claves = entradas.map((e) => trackKey(e.artista, e.titulo));
  const porClave = await getTrackHistory(db, claves, Date.now());

  const salida: HistoriaPorUri = {};
  for (const e of entradas) {
    const h = porClave.get(trackKey(e.artista, e.titulo));
    if (h) salida[e.uri] = h;
  }
  return salida;
}
