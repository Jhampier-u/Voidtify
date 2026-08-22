import { inArray, sql } from "drizzle-orm";
import { streams } from "@/db/schema";
import { MS_MINIMO_CONTADO, type Db } from "./shared";

/**
 * Historia de escucha de una canción concreta, sobre todo el archivo.
 *
 * Deliberadamente **no** acepta un rango. Su razón de ser es ordenar playlists
 * por cosas como «lo que no suena desde hace un año», y eso solo tiene sentido
 * mirando el historial entero: recortarlo a los últimos 28 días haría que casi
 * todo apareciera como nunca escuchado.
 */
export type TrackHistory = {
  clave: string;
  /** Reproducciones que superaron el umbral. */
  plays: number;
  /** Tiempo total, sin filtrar por umbral. */
  ms: number;
  primeraVez: number;
  ultimaVez: number;
  diasDesdeUltima: number;
  /** Hora local en la que más suele sonar, o null si no hay reproducciones contadas. */
  horaModal: number | null;
  /** Filas con información de abandono, es decir importadas. */
  conDatosSalto: number;
  abandonadas: number;
  /** Proporción entre 0 y 1, o null si no hay ninguna fila con dato. */
  tasaSalto: number | null;
};

/**
 * SQLite admite 999 parámetros por consulta en su compilación por defecto.
 * Una playlist de mil canciones reventaría con «too many SQL variables», y lo
 * haría solo en producción: los tests trabajan con tres filas.
 */
const POR_LOTE = 400;

const DIA_MS = 86_400_000;

type FilaAgregada = {
  clave: string;
  plays: number;
  ms: number;
  primera: number;
  ultima: number;
  con_datos: number;
  abandonadas: number;
};

type FilaHora = { clave: string; hora: number };

function lotes<T>(valores: T[], tamano: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < valores.length; i += tamano) {
    out.push(valores.slice(i, i + tamano));
  }
  return out;
}

/**
 * Devuelve la historia de cada clave pedida, indexada por clave.
 *
 * Las claves que no aparecen en el historial simplemente no están en el mapa,
 * en vez de devolver ceros: «nunca la has escuchado» y «la has escuchado cero
 * veces» son la misma cosa, pero quien consume esto necesita distinguir la
 * ausencia para pintar un guion en lugar de un 0.
 *
 * Se agrupa por `track_key`, no por URI. El mismo tema tiene URIs distintas
 * según la edición o el mercado, y agrupar por URI partiría su historia en
 * trozos.
 */
export async function getTrackHistory(
  db: Db,
  claves: string[],
  ahoraMs: number,
): Promise<Map<string, TrackHistory>> {
  const mapa = new Map<string, TrackHistory>();
  if (claves.length === 0) return mapa;

  // Duplicadas no aportan nada y engordan el `IN`; una playlist puede repetir
  // la misma canción.
  const unicas = [...new Set(claves)];

  for (const lote of lotes(unicas, POR_LOTE)) {
    const filtro = inArray(streams.trackKey, lote);

    const agregadas = db.all<FilaAgregada>(sql`
      SELECT
        ${streams.trackKey} AS clave,
        SUM(CASE WHEN ${streams.msPlayed} >= ${MS_MINIMO_CONTADO} THEN 1 ELSE 0 END) AS plays,
        SUM(${streams.msPlayed})                                                     AS ms,
        MIN(${streams.ts})                                                           AS primera,
        MAX(${streams.ts})                                                           AS ultima,
        SUM(CASE WHEN ${streams.source} = 'import' AND ${streams.skipped} IS NOT NULL
                 THEN 1 ELSE 0 END)                                                  AS con_datos,
        SUM(CASE WHEN ${streams.source} = 'import' AND ${streams.skipped} = 1
                 THEN 1 ELSE 0 END)                                                  AS abandonadas
      FROM ${streams}
      WHERE ${filtro}
      GROUP BY ${streams.trackKey}
    `);

    // La hora modal necesita su propia pasada: es la moda de una agregación, y
    // no se puede sacar en la misma consulta sin una función de ventana sobre
    // el resultado agrupado. El desempate por hora ascendente es lo que hace
    // que el valor no cambie entre ejecuciones con los mismos datos.
    const horas = db.all<FilaHora>(sql`
      SELECT clave, hora FROM (
        SELECT
          ${streams.trackKey} AS clave,
          ${streams.localHour} AS hora,
          ROW_NUMBER() OVER (
            PARTITION BY ${streams.trackKey}
            ORDER BY COUNT(*) DESC, ${streams.localHour} ASC
          ) AS rn
        FROM ${streams}
        WHERE ${filtro} AND ${streams.msPlayed} >= ${MS_MINIMO_CONTADO}
        GROUP BY ${streams.trackKey}, ${streams.localHour}
      )
      WHERE rn = 1
    `);

    const horaPorClave = new Map(horas.map((h) => [h.clave, h.hora]));

    for (const f of agregadas) {
      mapa.set(f.clave, {
        clave: f.clave,
        plays: f.plays,
        ms: f.ms,
        primeraVez: f.primera,
        ultimaVez: f.ultima,
        diasDesdeUltima: Math.floor((ahoraMs - f.ultima) / DIA_MS),
        horaModal: horaPorClave.get(f.clave) ?? null,
        conDatosSalto: f.con_datos,
        abandonadas: f.abandonadas,
        tasaSalto: f.con_datos > 0 ? f.abandonadas / f.con_datos : null,
      });
    }
  }

  return mapa;
}
