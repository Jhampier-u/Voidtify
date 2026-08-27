import { sql } from "drizzle-orm";
import { streams } from "@/db/schema";
import { contadas, enRango, type Db } from "./shared";
import type { StatsRange } from "./range";
import { porEje } from "./etiquetas";

export type Granularidad = "mes" | "semana";

/** `periodo` es `YYYY-MM` por meses y el lunes en `YYYY-MM-DD` por semanas. */
export type FilaMes = { periodo: string; key: string; plays: number };

/**
 * Reproducciones por mes y artista.
 *
 * Sin filtrar por artista a propósito, aunque solo interesen unos cuantos.
 * Atar mil claves en un `IN` obliga a SQLite a una búsqueda por índice por
 * cada una y tarda 1.182 ms sobre todo el historial; agrupar entero y filtrar
 * después en memoria tarda 144. La misma consulta, ocho veces más rápida.
 */
export async function getMezclaPorMes(
  db: Db,
  range: StatsRange,
): Promise<FilaMes[]> {
  return db.all<FilaMes>(sql`
    SELECT
      substr(${streams.localDate}, 1, 7) AS periodo,
      ${streams.artistKey}               AS key,
      COUNT(*)                           AS plays
    FROM ${streams}
    WHERE ${enRango(range)} AND ${contadas()}
    GROUP BY periodo, key
  `);
}

/**
 * Lo mismo por semanas, para los rangos que no llegan a cuatro meses.
 *
 * `date(d, '-6 days', 'weekday 1')` da el lunes de la semana de `d`:
 * `weekday 1` avanza al siguiente lunes y se queda si ya lo es, así que
 * retroceder seis días primero deja el lunes de la propia semana tanto si `d`
 * es lunes como si es domingo.
 */
export async function getMezclaPorSemana(
  db: Db,
  range: StatsRange,
): Promise<FilaMes[]> {
  return db.all<FilaMes>(sql`
    SELECT
      date(${streams.localDate}, '-6 days', 'weekday 1') AS periodo,
      ${streams.artistKey}                               AS key,
      COUNT(*)                                           AS plays
    FROM ${streams}
    WHERE ${enRango(range)} AND ${contadas()}
    GROUP BY periodo, key
  `);
}

export type PuntoMezcla = {
  /** `YYYY-MM` por meses, el lunes en `YYYY-MM-DD` por semanas. */
  periodo: string;
  /** Reproducciones atribuidas ese mes, para saber si el punto tiene peso. */
  total: number;
  /**
   * Proporción de cada género dibujado, en el mismo orden que `generos`.
   *
   * Suman uno junto a `otros`, salvo en un mes sin nada, donde todo va a cero.
   */
  partes: number[];
  /** Todo lo demás, para que la pila llegue siempre arriba. */
  otros: number;
};

export type Mezcla = {
  generos: string[];
  granularidad: Granularidad;
  puntos: PuntoMezcla[];
};

/**
 * Periodos distintos a partir de los cuales la mezcla dice algo.
 *
 * Con menos, la superficie degenera: dos puntos unidos dibujan una transición
 * suave que nadie vivió.
 */
export const MINIMO_PERIODOS = 4;

const MESES_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/** `2026-08` a «ago 26»; `2026-08-24` a «24 ago». */
export function etiquetaPeriodo(periodo: string, granularidad: Granularidad): string {
  const [a, m, d] = periodo.split("-").map(Number);
  return granularidad === "mes"
    ? `${MESES_ES[m - 1]} ${String(a).slice(2)}`
    : `${d} ${MESES_ES[m - 1]}`;
}

function siguiente(periodo: string, granularidad: Granularidad): string {
  if (granularidad === "semana") {
    const [a, m, d] = periodo.split("-").map(Number);
    const v = new Date(Date.UTC(a, m - 1, d) + 7 * 86_400_000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
  }
  const [a, m] = periodo.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

/**
 * Cómo cambia el reparto de géneros mes a mes.
 *
 * Va normalizado: cada mes suma uno. La pregunta que responde es «de qué estaba
 * hecho lo que escuchabas entonces», no «cuánto escuchabas» — eso ya lo cuenta
 * el gráfico de evolución que va más arriba, y repetirlo aquí en forma de área
 * apilada sería el mismo dato dos veces.
 *
 * Los meses sin escuchas se dibujan igual, en cero. Saltárselos uniría marzo
 * con junio en una línea continua y enseñaría una transición suave donde en
 * realidad hubo tres meses de silencio.
 */
export function construirMezcla(
  filas: FilaMes[],
  generosPorClave: Map<string, string[]>,
  /** Los géneros que se dibujan, en orden. */
  generos: string[],
  granularidad: Granularidad = "mes",
  /** Cuántas etiquetas de género se le atribuyen a cada artista. */
  porArtista = 3,
): Mezcla {
  if (filas.length === 0 || generos.length === 0) {
    return { generos, granularidad, puntos: [] };
  }

  const indice = new Map(generos.map((g, i) => [g, i]));

  // periodo -> [plays por género dibujado, plays de todo lo demás]
  const acumulado = new Map<string, { partes: number[]; otros: number }>();

  for (const f of filas) {
    const tags = generosPorClave.get(f.key);
    const acc = acumulado.get(f.periodo) ?? {
      partes: Array<number>(generos.length).fill(0),
      otros: 0,
    };
    acumulado.set(f.periodo, acc);

    // Un artista sin etiquetas no desaparece del gráfico: entra en «otros».
    // Sacarlo haría que los meses peor cubiertos por la caché pareciesen más
    // puros de lo que son.
    const suyos = tags
      ? porEje(tags).genero.slice(0, porArtista)
      : [];

    let repartido = false;
    for (const g of suyos) {
      const i = indice.get(g);
      if (i !== undefined) {
        acc.partes[i] += f.plays;
        repartido = true;
      }
    }
    if (!repartido) acc.otros += f.plays;
  }

  const ordenados = [...acumulado.keys()].sort();
  const puntos: PuntoMezcla[] = [];

  // Se recorre periodo a periodo desde el primero hasta el último, rellenando
  // los que no aparecen en los datos: son silencio y tienen que verse.
  let periodo = ordenados[0];
  const ultimo = ordenados[ordenados.length - 1];
  for (;;) {
    const acc = acumulado.get(periodo);
    const total = acc ? acc.partes.reduce((a, b) => a + b, 0) + acc.otros : 0;

    puntos.push({
      periodo,
      total,
      partes:
        acc && total > 0
          ? acc.partes.map((p) => p / total)
          : Array<number>(generos.length).fill(0),
      otros: acc && total > 0 ? acc.otros / total : 0,
    });

    if (periodo === ultimo) break;
    periodo = siguiente(periodo, granularidad);
  }

  return { generos, granularidad, puntos };
}
