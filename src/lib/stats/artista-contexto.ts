import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { artistGenres, artistStats } from "@/db/schema";
import type { Db } from "./shared";

export type ContextoArtista = {
  generos: string[];
  /** Oyentes en Last.fm. Sustituye al `popularity` que Spotify retiró. */
  listeners: number | null;
  playcount: number | null;
  /**
   * Proporción de tus artistas con menos oyentes que este, entre 0 y 1.
   *
   * Null cuando no hay muestra suficiente para que signifique algo.
   */
  percentil: number | null;
  /** Cuántos artistas tuyos entraron en la comparación. */
  muestra: number;
};

/**
 * Muestra mínima para atreverse a situar a un artista.
 *
 * Con veinte artistas medidos, decir «más de nicho que el 90 % de lo que
 * escuchas» habla de dieciocho nombres: una cifra con pinta de estadística que
 * no lo es. Mejor callarse hasta que la comparación sostenga la frase.
 */
const MUESTRA_MINIMA = 50;

/**
 * Géneros y popularidad de un artista, con su lugar entre los que escuchas.
 *
 * La cifra de oyentes suelta no dice gran cosa: nadie sabe si dos millones es
 * mucho. Comparada con el resto de tu biblioteca sí — es la diferencia entre
 * «2.331.147 oyentes» y «más de nicho que el 70 % de lo que escuchas».
 */
export async function getContextoArtista(
  db: Db,
  artistKey: string,
): Promise<ContextoArtista> {
  const [gen] = await db
    .select({ generos: artistGenres.genres })
    .from(artistGenres)
    .where(eq(artistGenres.artistKey, artistKey))
    .limit(1);

  const [stats] = await db
    .select({
      listeners: artistStats.listeners,
      playcount: artistStats.playcount,
    })
    .from(artistStats)
    .where(eq(artistStats.artistKey, artistKey))
    .limit(1);

  let generos: string[] = [];
  if (gen?.generos) {
    try {
      const v = JSON.parse(gen.generos);
      if (Array.isArray(v)) generos = v.filter((x) => typeof x === "string");
    } catch {
      // Un JSON corrupto en la caché no debe tumbar la ficha entera.
    }
  }

  const listeners = stats?.listeners ?? null;
  const playcount = stats?.playcount ?? null;

  const [{ n: muestra }] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(artistStats)
    .where(isNotNull(artistStats.listeners));

  let percentil: number | null = null;
  if (listeners !== null && muestra >= MUESTRA_MINIMA) {
    const [{ n: menores }] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(artistStats)
      .where(
        and(isNotNull(artistStats.listeners), lt(artistStats.listeners, listeners)),
      );
    percentil = menores / muestra;
  }

  return { generos, listeners, playcount, percentil, muestra };
}

/**
 * El percentil dicho en palabras.
 *
 * Se cuenta desde el lado que resulte más informativo: para un artista pequeño
 * interesa cuánto de nicho es, y para uno grande cuánto de conocido. Decir
 * siempre «más conocido que el 4 %» obligaría a darle la vuelta mentalmente.
 */
export function frasePercentil(percentil: number): string {
  const pct = Math.round(percentil * 100);
  return pct >= 50
    ? `más conocido que el ${pct} % de lo que escuchas`
    : `más de nicho que el ${100 - pct} % de lo que escuchas`;
}
