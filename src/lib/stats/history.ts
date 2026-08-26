import { sql, type SQL } from "drizzle-orm";
import { streams } from "@/db/schema";
import { normalizeName } from "./normalize";
import type { StatsRange } from "./range";
import { enRango, type Db } from "./shared";

export type HistoryRow = {
  id: number;
  ts: number;
  /** Claves normalizadas, para la carátula y para enlazar a la ficha. */
  trackKey: string;
  artistKey: string;
  trackName: string;
  artistName: string;
  albumName: string | null;
  msPlayed: number;
  localDate: string;
  localHour: number;
  source: string;
};

export type HistoryPage = { rows: HistoryRow[]; total: number };

export type HistoryOptions = {
  limite?: number;
  desplazamiento?: number;
  busqueda?: string;
};

const LIMITE_POR_DEFECTO = 100;

/**
 * Términos de una consulta, normalizados.
 *
 * Se exporta para poder probarlo aparte: la separación en términos decide qué
 * encuentra el buscador, y equivocarse ahí no lanza ningún error — simplemente
 * no aparece lo que estabas buscando.
 */
export function terminosDeBusqueda(busqueda: string): string[] {
  return [
    ...new Set(
      normalizeName(busqueda)
        .split(" ")
        .filter((t) => t.length > 0),
    ),
  ];
}

/**
 * Filtro de búsqueda sobre las claves normalizadas.
 *
 * Se busca en `track_key` y `album_key`, no en los nombres visibles, porque
 * esas columnas ya están en minúsculas y sin acentos: así "SIGUR ROS" encuentra
 * "Sigur Rós" sin necesitar `COLLATE` ni normalizar en SQL. `track_key` lleva
 * dentro la clave del artista, de modo que buscar en ella cubre título y
 * artista a la vez.
 *
 * Cada término debe aparecer, en cualquier orden y en cualquiera de los dos
 * campos. Con la frase entera como un solo patrón había que escribir el nombre
 * tal cual: «souvlaki slowdive» no encontraba nada, porque ese orden no existe
 * en ninguna de las dos columnas.
 *
 * Es un `LIKE` con comodín inicial, que no puede usar índice. Con cientos de
 * miles de filas seguirá siendo un escaneo completo; si algún día molesta, la
 * respuesta es FTS5, no otro índice.
 */
function filtroBusqueda(terminos: string[]): SQL {
  const condiciones = terminos.map((t) => {
    const patron = `%${t}%`;
    return sql`(${streams.trackKey} LIKE ${patron} OR ${streams.albumKey} LIKE ${patron})`;
  });
  return sql.join(condiciones, sql` AND `);
}

export async function getHistory(
  db: Db,
  range: StatsRange,
  opciones: HistoryOptions = {},
): Promise<HistoryPage> {
  const limite = opciones.limite ?? LIMITE_POR_DEFECTO;
  const desplazamiento = opciones.desplazamiento ?? 0;

  const terminos = terminosDeBusqueda(opciones.busqueda ?? "");
  const filtro =
    terminos.length > 0
      ? sql`${enRango(range)} AND ${filtroBusqueda(terminos)}`
      : enRango(range);

  const total = db.all<{ n: number }>(sql`
    SELECT COUNT(*) AS n FROM ${streams} WHERE ${filtro}
  `)[0]?.n ?? 0;

  const rows = db.all<HistoryRow>(sql`
    SELECT
      ${streams.id}          AS id,
      ${streams.ts}          AS ts,
      ${streams.trackKey}    AS trackKey,
      ${streams.artistKey}   AS artistKey,
      ${streams.trackName}   AS trackName,
      ${streams.artistName}  AS artistName,
      ${streams.albumName}   AS albumName,
      ${streams.msPlayed}    AS msPlayed,
      ${streams.localDate}   AS localDate,
      ${streams.localHour}   AS localHour,
      ${streams.source}      AS source
    FROM ${streams}
    WHERE ${filtro}
    ORDER BY ${streams.ts} DESC
    LIMIT ${limite} OFFSET ${desplazamiento}
  `);

  return { rows, total };
}

export type TotalDia = { plays: number; ms: number };

/**
 * Totales de unos días concretos, para las cabeceras del historial.
 *
 * Se piden solo los días que se van a pintar y no el rango entero: una página
 * muestra cien filas, que rara vez pasan de tres o cuatro días.
 *
 * Y son los totales del día completo, no de las filas de esta página. Un día
 * puede quedar partido entre dos páginas, y contar solo lo visible daría una
 * cifra que cambia al pasar de página sin que cambien los datos.
 */
export async function getTotalesDeDias(
  db: Db,
  fechas: string[],
): Promise<Record<string, TotalDia>> {
  if (fechas.length === 0) return {};

  const filas = db.all<{ date: string; plays: number; ms: number }>(sql`
    SELECT
      ${streams.localDate}     AS date,
      COUNT(*)                 AS plays,
      SUM(${streams.msPlayed}) AS ms
    FROM ${streams}
    WHERE ${streams.localDate} IN ${fechas}
    GROUP BY ${streams.localDate}
  `);

  const salida: Record<string, TotalDia> = {};
  for (const f of filas) salida[f.date] = { plays: f.plays, ms: f.ms };
  return salida;
}
