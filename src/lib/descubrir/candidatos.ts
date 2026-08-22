import "server-only";
import { sql } from "drizzle-orm";
import { streams } from "@/db/schema";
import { getSimilarTracks } from "@/lib/lastfm";
import { getTopTracks } from "@/lib/stats/tops";
import type { StatsRange } from "@/lib/stats/range";
import type { Db } from "@/lib/stats/shared";
import { mezclar, type Candidato, type SimilarEntrada } from "./mezcla";

/**
 * Cuántas de tus canciones se usan como semilla.
 *
 * Cada una es una llamada a Last.fm, y el limitador las espacia 220 ms: doce
 * semillas son menos de tres segundos. Subirlo mucho alarga la espera sin
 * mejorar gran cosa, porque las sugerencias empiezan a repetirse.
 */
const SEMILLAS = 12;

/** Sugerencias que se piden por semilla. */
const POR_SEMILLA = 30;

export type Descubrimiento = {
  candidatos: Candidato[];
  /** Las canciones tuyas de las que salió todo, para poder explicarlo. */
  semillas: { titulo: string; artista: string }[];
};

/**
 * Lo ya escuchado, para no proponerlo.
 *
 * Se traen las claves distintas, no las filas: son decenas de miles frente a
 * cientos de miles, y el conjunto tiene que caber en memoria.
 */
function conocido(db: Db): {
  canciones: Set<string>;
  artistas: Set<string>;
} {
  const t = db.all<{ clave: string }>(
    sql`SELECT DISTINCT ${streams.trackKey} AS clave FROM ${streams}`,
  );
  const a = db.all<{ clave: string }>(
    sql`SELECT DISTINCT ${streams.artistKey} AS clave FROM ${streams}`,
  );
  return {
    canciones: new Set(t.map((r) => r.clave)),
    artistas: new Set(a.map((r) => r.clave)),
  };
}

/**
 * Propone canciones que no has escuchado, a partir de las que más escuchas.
 *
 * El motor es Last.fm porque `/recommendations` de Spotify devuelve 404 desde
 * que lo retiraron. A cambio tenemos algo que ningún motor ajeno tiene: el
 * historial completo, que sirve para descartar todo lo ya conocido en vez de
 * devolverte tus propios éxitos disfrazados de novedad.
 */
export async function descubrir(
  db: Db,
  range: StatsRange,
  limite = 40,
): Promise<Descubrimiento> {
  const top = await getTopTracks(db, range, "plays", SEMILLAS);
  if (top.length === 0) return { candidatos: [], semillas: [] };

  // En serie a propósito: el limitador de Last.fm es una cola única, así que
  // lanzarlas en paralelo no las aceleraría y sí haría más difícil saber cuál
  // falló.
  const porSemilla: SimilarEntrada[][] = [];
  for (const t of top) {
    porSemilla.push(await getSimilarTracks(t.artistName, t.name, POR_SEMILLA));
  }

  const { canciones, artistas } = conocido(db);

  return {
    candidatos: mezclar(porSemilla, canciones, artistas, limite),
    semillas: top.map((t) => ({ titulo: t.name, artista: t.artistName })),
  };
}
