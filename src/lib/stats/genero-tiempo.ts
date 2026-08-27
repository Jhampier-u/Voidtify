import { sql } from "drizzle-orm";
import { streams } from "@/db/schema";
import { contadas, enRango, type Db } from "./shared";
import type { StatsRange } from "./range";
import { porEje } from "./etiquetas";

export type FilaMes = { mes: string; key: string; plays: number };

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
      substr(${streams.localDate}, 1, 7) AS mes,
      ${streams.artistKey}               AS key,
      COUNT(*)                           AS plays
    FROM ${streams}
    WHERE ${enRango(range)} AND ${contadas()}
    GROUP BY mes, key
  `);
}

export type PuntoMezcla = {
  /** `YYYY-MM`. */
  mes: string;
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
  puntos: PuntoMezcla[];
};

/** Meses distintos a partir de los cuales la mezcla dice algo. */
export const MINIMO_MESES = 4;

const MESES_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/** `2026-08` a «ago 26». */
export function etiquetaMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES_ES[m - 1]} ${String(a).slice(2)}`;
}

function siguienteMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 12
    ? `${a + 1}-01`
    : `${a}-${String(m + 1).padStart(2, "0")}`;
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
  /** Cuántas etiquetas de género se le atribuyen a cada artista. */
  porArtista = 3,
): Mezcla {
  if (filas.length === 0 || generos.length === 0) {
    return { generos, puntos: [] };
  }

  const indice = new Map(generos.map((g, i) => [g, i]));

  // mes -> [plays por género dibujado, plays de todo lo demás]
  const acumulado = new Map<string, { partes: number[]; otros: number }>();

  for (const f of filas) {
    const tags = generosPorClave.get(f.key);
    const acc = acumulado.get(f.mes) ?? {
      partes: Array<number>(generos.length).fill(0),
      otros: 0,
    };
    acumulado.set(f.mes, acc);

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

  // Se recorre mes a mes desde el primero hasta el último, rellenando los que
  // no aparecen en los datos: son meses de silencio y tienen que verse.
  let mes = ordenados[0];
  const ultimo = ordenados[ordenados.length - 1];
  for (;;) {
    const acc = acumulado.get(mes);
    const total = acc ? acc.partes.reduce((a, b) => a + b, 0) + acc.otros : 0;

    puntos.push({
      mes,
      total,
      partes:
        acc && total > 0
          ? acc.partes.map((p) => p / total)
          : Array<number>(generos.length).fill(0),
      otros: acc && total > 0 ? acc.otros / total : 0,
    });

    if (mes === ultimo) break;
    mes = siguienteMes(mes);
  }

  return { generos, puntos };
}
