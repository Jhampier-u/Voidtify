import { sql } from "drizzle-orm";
import { streams } from "@/db/schema";
import { contadas, enRango, type Db } from "./shared";
import type { StatsRange } from "./range";

export type DiaDestacado = {
  /** `YYYY-MM-DD`. */
  date: string;
  trackKey: string;
  trackName: string;
  artistName: string;
  plays: number;
};

/**
 * Lo más sonado de cada día del rango.
 *
 * Solo se pide cuando las casillas del calendario son lo bastante grandes como
 * para mostrarlo: en el histórico serían casi tres mil filas para pintar
 * cuadrados de treinta píxeles donde no cabe ni el número del día.
 *
 * El desempate va por nombre y no se deja al azar: sin él, dos canciones con
 * las mismas escuchas se turnarían entre recargas y el calendario parecería
 * cambiar solo.
 */
export async function getDestacadoPorDia(
  db: Db,
  range: StatsRange,
): Promise<DiaDestacado[]> {
  return db.all<DiaDestacado>(sql`
    SELECT date, track_key AS trackKey, track_name AS trackName,
           artist_name AS artistName, plays
    FROM (
      SELECT
        ${streams.localDate}   AS date,
        ${streams.trackKey}    AS track_key,
        MIN(${streams.trackName})  AS track_name,
        MIN(${streams.artistName}) AS artist_name,
        COUNT(*)               AS plays,
        ROW_NUMBER() OVER (
          PARTITION BY ${streams.localDate}
          ORDER BY COUNT(*) DESC, MIN(${streams.trackName}) ASC
        ) AS puesto
      FROM ${streams}
      WHERE ${enRango(range)} AND ${contadas()}
      GROUP BY ${streams.localDate}, ${streams.trackKey}
    )
    WHERE puesto = 1
  `);
}
