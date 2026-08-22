import { sql } from "drizzle-orm";
import { artistGenres, artistStats, streams } from "@/db/schema";
import { contadas, type Db } from "@/lib/stats/shared";
import { guardarGeneros } from "@/lib/stats/genres";
import { getArtistInfo } from "@/lib/lastfm";

export type ArtistaPendiente = { key: string; name: string };

/**
 * Cuántos artistas se resuelven en cada captura.
 *
 * El limitador de Last.fm serializa a ~4,5 por segundo, así que veinte añaden
 * unos cuatro segundos y medio a una captura que hoy tarda uno. Con una cada
 * veinte minutos son unos 1.400 al día: los 10.680 del historial quedan
 * cubiertos en poco más de una semana, sin que nadie pulse nada.
 */
export const POR_CAPTURA = 20;

/** Cuándo se vuelve a preguntar por un artista ya resuelto. */
export const MAX_EDAD_MS = 90 * 86_400_000;

/**
 * Artistas que hace falta consultar, los más escuchados primero.
 *
 * Entran los que no se han consultado nunca y los que se consultaron hace más
 * de `maxEdadMs`. El orden por reproducciones importa: el reparto de géneros
 * lo dominan los artistas que más suenan, así que resolverlos antes hace que
 * la pantalla sea útil desde el primer día en vez de al terminar del todo.
 */
export function getArtistasParaRefrescar(
  db: Db,
  limite: number,
  ahoraMs: number,
  maxEdadMs: number = MAX_EDAD_MS,
): ArtistaPendiente[] {
  const corte = ahoraMs - maxEdadMs;

  return db.all<ArtistaPendiente>(sql`
    SELECT
      ${streams.artistKey}       AS key,
      MAX(${streams.artistName}) AS name
    FROM ${streams}
    LEFT JOIN ${artistGenres} ON ${artistGenres.artistKey} = ${streams.artistKey}
    WHERE ${contadas()}
      AND (${artistGenres.artistKey} IS NULL OR ${artistGenres.fetchedAt} < ${corte})
    GROUP BY ${streams.artistKey}
    ORDER BY COUNT(*) DESC
    LIMIT ${limite}
  `);
}

export async function guardarStats(
  db: Db,
  artistKey: string,
  listeners: number | null,
  playcount: number | null,
  ahoraMs: number,
): Promise<void> {
  const valores = { artistKey, listeners, playcount, fetchedAt: ahoraMs };
  await db
    .insert(artistStats)
    .values(valores)
    .onConflictDoUpdate({ target: artistStats.artistKey, set: valores });
}

export type ResultadoRelleno = {
  pedidos: number;
  conEtiquetas: number;
};

/**
 * Resuelve un lote pequeño de artistas contra Last.fm.
 *
 * Pensado para colgarse de la captura periódica. Antes esto dependía de que
 * alguien abriera una pantalla y pulsara un botón unas doscientas sesenta
 * veces: el resultado fue que, tras dos semanas, había 40 artistas resueltos
 * de 10.680.
 */
export async function rellenarGenerosEnLote(
  db: Db,
  limite: number = POR_CAPTURA,
  ahoraMs: number = Date.now(),
): Promise<ResultadoRelleno> {
  const pendientes = getArtistasParaRefrescar(db, limite, ahoraMs);

  let conEtiquetas = 0;
  for (const a of pendientes) {
    // Un fallo en un artista no debe abortar el lote: `getArtistInfo` ya
    // devuelve vacío ante cualquier problema, y guardarlo evita reintentarlo
    // en cada pasada. Se reintentará cuando caduque.
    const info = await getArtistInfo(a.name);
    await guardarGeneros(db, a.key, info.tags);
    await guardarStats(db, a.key, info.listeners, info.playcount, ahoraMs);
    if (info.tags.length > 0) conEtiquetas += 1;
  }

  return { pedidos: pendientes.length, conEtiquetas };
}
