import { sql } from "drizzle-orm";
import { streams } from "@/db/schema";
import type { StatsRange } from "./range";
import { enRango, type Db } from "./shared";

export type SkipStats = {
  /** Filas con información de abandono, es decir importadas. */
  conDatos: number;
  abandonadas: number;
  /** Proporción sobre `conDatos`, entre 0 y 1. */
  tasa: number;
  /** Fecha local desde la que hay datos fiables, o null si no hay ninguno. */
  desde: string | null;
  /**
   * Última fecha con datos de abandono **en todo el archivo**, no en el rango.
   *
   * Se necesita para poder explicar un panel vacío. El abandono solo llega en
   * el volcado, que termina el día en que se pidió: cualquier rango posterior
   * no tendrá ni una fila, y decir «ningún artista llega al mínimo» daría a
   * entender que no saltas nada.
   */
  hastaEnArchivo: string | null;
};

export type SkippedArtist = {
  key: string;
  name: string;
  plays: number;
  abandonadas: number;
  tasa: number;
};

/**
 * El abandono solo se calcula sobre filas importadas.
 *
 * `/me/player/recently-played` no informa de si una canción se saltó, así que
 * las filas capturadas en vivo llevan `skipped` a NULL. Contarlas como "no
 * abandonadas" hundiría la tasa sin que nada lo indicara — un número plausible
 * y falso, que es peor que no tener número.
 */
const SOLO_IMPORTADAS = sql`${streams.source} = 'import' AND ${streams.skipped} IS NOT NULL`;

export async function getSkipStats(
  db: Db,
  range: StatsRange,
): Promise<SkipStats> {
  const f = db.all<{
    con_datos: number;
    abandonadas: number;
    desde: string | null;
  }>(sql`
    SELECT
      COUNT(*)                                                  AS con_datos,
      SUM(CASE WHEN ${streams.skipped} = 1 THEN 1 ELSE 0 END)   AS abandonadas,
      MIN(${streams.localDate})                                 AS desde
    FROM ${streams}
    WHERE ${enRango(range)} AND ${SOLO_IMPORTADAS}
  `)[0];

  // Sin filtro de rango a propósito: es el limite del dato, no del periodo.
  const limite = db.all<{ hasta: string | null }>(sql`
    SELECT MAX(${streams.localDate}) AS hasta
    FROM ${streams}
    WHERE ${SOLO_IMPORTADAS}
  `)[0];

  const conDatos = f?.con_datos ?? 0;
  const abandonadas = f?.abandonadas ?? 0;

  return {
    hastaEnArchivo: limite?.hasta ?? null,
    conDatos,
    abandonadas,
    tasa: conDatos === 0 ? 0 : abandonadas / conDatos,
    desde: conDatos === 0 ? null : (f?.desde ?? null),
  };
}

/**
 * Artistas que más se abandonan, con un mínimo de escuchas para entrar.
 *
 * Sin ese mínimo, el ranking lo copan artistas con una sola reproducción
 * saltada: una tasa del 100 % sobre un caso no dice nada de nadie.
 */
export async function getMostSkippedArtists(
  db: Db,
  range: StatsRange,
  minimo = 20,
  limite = 10,
): Promise<SkippedArtist[]> {
  return db.all<SkippedArtist>(sql`
    SELECT
      ${streams.artistKey}                                      AS key,
      MAX(${streams.artistName})                                AS name,
      COUNT(*)                                                  AS plays,
      SUM(CASE WHEN ${streams.skipped} = 1 THEN 1 ELSE 0 END)   AS abandonadas,
      CAST(SUM(CASE WHEN ${streams.skipped} = 1 THEN 1 ELSE 0 END) AS REAL)
        / COUNT(*)                                              AS tasa
    FROM ${streams}
    WHERE ${enRango(range)} AND ${SOLO_IMPORTADAS}
    GROUP BY ${streams.artistKey}
    HAVING COUNT(*) >= ${minimo}
    ORDER BY tasa DESC, plays DESC
    LIMIT ${limite}
  `);
}
