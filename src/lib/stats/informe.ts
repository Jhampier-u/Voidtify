import { sql } from "drizzle-orm";
import { streams } from "@/db/schema";
import { getTopArtists, getTopTracks } from "./tops";
import { getTotals, type Totals } from "./totals";
import type { StatsRange } from "./range";
import type { Db } from "./shared";
import {
  anterior,
  compararRanking,
  limites,
  type Comparacion,
  type Periodo,
  type TipoPeriodo,
} from "./periodo";

/** Cuántas entradas se comparan en cada ranking. */
const PROFUNDIDAD = 15;

export type Resumen = Totals & { periodo: Periodo };

export type Informe = {
  tipo: TipoPeriodo;
  periodo: Periodo;
  periodoAnterior: Periodo;
  actual: Resumen;
  previo: Resumen;
  artistas: Comparacion;
  canciones: Comparacion;
};

/**
 * Un periodo se convierte en rango para reutilizar todo lo que ya sabe
 * consultar por `local_date`. No se inventa una consulta paralela: cualquier
 * diferencia entre las dos daría cifras distintas para lo mismo según la
 * pantalla.
 */
function comoRango(periodo: Periodo, tipo: TipoPeriodo): StatsRange {
  const { desde, hasta } = limites(periodo, tipo);
  return { fromDate: desde, toDate: hasta, label: periodo, preset: "custom" };
}

/**
 * Periodos que tienen alguna escucha, del más reciente al más antiguo.
 *
 * Se derivan de los datos en vez de generarse por calendario: así no aparecen
 * semanas vacías de una temporada en la que no se escuchó nada.
 */
export async function periodosConDatos(
  db: Db,
  tipo: TipoPeriodo,
): Promise<Periodo[]> {
  // El lunes se calcula en SQL para no traer 272.000 fechas a memoria solo
  // para agruparlas. `-6 days` + `weekday 1` da el lunes de esa misma semana:
  // `weekday 1` a secas daría el lunes *siguiente* para cualquier día que no
  // sea lunes.
  const expr =
    tipo === "semana"
      ? sql`date(${streams.localDate}, '-6 days', 'weekday 1')`
      : tipo === "mes"
        ? sql`substr(${streams.localDate}, 1, 7)`
        : sql`substr(${streams.localDate}, 1, 4)`;

  const filas = db.all<{ p: string }>(sql`
    SELECT DISTINCT ${expr} AS p
    FROM ${streams}
    ORDER BY p DESC
  `);
  return filas.map((f) => f.p);
}

async function resumen(
  db: Db,
  periodo: Periodo,
  tipo: TipoPeriodo,
): Promise<Resumen> {
  const totales = await getTotals(db, comoRango(periodo, tipo));
  return { ...totales, periodo };
}

/**
 * Un periodo frente al inmediatamente anterior.
 *
 * Se calcula al vuelo desde `streams`, sin tabla de resúmenes. Guardarlos solo
 * haría falta para datos que no se pueden recalcular —los tops que Spotify
 * computa con criterios que no publica, que es lo que sí guarda
 * `top_snapshots`—. Un top propio siempre se puede volver a contar, y hacerlo
 * así permite mirar cualquier semana desde 2018, no solo las posteriores a
 * haber montado esto.
 */
export async function getInforme(
  db: Db,
  tipo: TipoPeriodo,
  periodo: Periodo,
): Promise<Informe> {
  const previoId = anterior(periodo, tipo);
  const rangoActual = comoRango(periodo, tipo);
  const rangoPrevio = comoRango(previoId, tipo);

  const [actual, previo, artistasA, artistasP, cancionesA, cancionesP] =
    await Promise.all([
      resumen(db, periodo, tipo),
      resumen(db, previoId, tipo),
      getTopArtists(db, rangoActual, "plays", PROFUNDIDAD),
      getTopArtists(db, rangoPrevio, "plays", PROFUNDIDAD),
      getTopTracks(db, rangoActual, "plays", PROFUNDIDAD),
      getTopTracks(db, rangoPrevio, "plays", PROFUNDIDAD),
    ]);

  return {
    tipo,
    periodo,
    periodoAnterior: previoId,
    actual,
    previo,
    artistas: compararRanking(artistasA, artistasP),
    canciones: compararRanking(cancionesA, cancionesP),
  };
}
