import { sql } from "drizzle-orm";
import { streams } from "@/db/schema";
import { contadas, type Db } from "./shared";
import { porEje } from "./etiquetas";

export type VidaArtista = {
  key: string;
  total: number;
  /** Escuchas dentro de la ventana reciente. Cero es un artista dormido. */
  recientes: number;
  /** `YYYY-MM-DD` de la primera vez y de la última. */
  primera: string;
  ultima: string;
};

/**
 * Días sin sonar a partir de los cuales un género se considera dormido.
 *
 * Tres meses. Con uno saldrían cosas que simplemente no tocaban esa semana; con
 * un año solo saldría lo abandonado hace tanto que ya no se echa de menos.
 */
export const DIAS_DORMIDO = 90;

/** Escuchas mínimas de por vida para que valga la pena decir que duerme. */
const MINIMO_PARA_DORMIR = 120;

/**
 * El día en que empieza la ventana reciente.
 *
 * Se calcula sobre días de calendario en UTC y no restando milisegundos a una
 * fecha local: en un huso con horario de verano, noventa días de 86.400.000 ms
 * caen una hora antes o después y el corte se desplaza un día.
 */
export function inicioDeVentana(hoy: string, dias: number): string {
  const [a, m, d] = hoy.split("-").map(Number);
  const v = new Date(Date.UTC(a, m - 1, d) - dias * 86_400_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
}

/**
 * Primera vez, última vez y totales de cada artista, en todo el historial.
 *
 * Sin filtro de rango a propósito: la pregunta es cuándo entró algo en tu vida
 * y cuánto hace que no suena, y las dos se responden contra todo lo que hay.
 *
 * Se apoya en `streams_artist_date_idx`, que cubre las tres columnas. Con el
 * índice anterior, que solo llevaba `(artist_key, ts)`, cada fila obligaba a ir
 * a la tabla a leer `local_date` y esto tardaba 687 ms; cubierta, 23.
 */
export async function getVidaDeArtistas(
  db: Db,
  /** Primer día de la ventana reciente, `YYYY-MM-DD`. */
  desdeReciente: string,
): Promise<VidaArtista[]> {
  return db.all<VidaArtista>(sql`
    SELECT
      ${streams.artistKey} AS key,
      COUNT(*)             AS total,
      SUM(CASE WHEN ${streams.localDate} >= ${desdeReciente} THEN 1 ELSE 0 END)
                           AS recientes,
      MIN(${streams.localDate}) AS primera,
      MAX(${streams.localDate}) AS ultima
    FROM ${streams}
    WHERE ${contadas()}
    GROUP BY ${streams.artistKey}
  `);
}

export type VidaGenero = {
  name: string;
  /** Primer día en que sonó algo de este género, en todo tu historial. */
  primera: string;
  /** El último. */
  ultima: string;
  total: number;
  recientes: number;
};

/**
 * Cuándo entró cada género en tu vida y cuándo sonó por última vez.
 *
 * Un género hereda las fechas extremas de sus artistas: entró el día que sonó
 * el primero de ellos y sigue vivo mientras suene cualquiera.
 */
export function construirVidaDeGeneros(
  artistas: VidaArtista[],
  generosPorClave: Map<string, string[]>,
  porArtista = 3,
): Map<string, VidaGenero> {
  const salida = new Map<string, VidaGenero>();

  for (const a of artistas) {
    const tags = generosPorClave.get(a.key);
    if (!tags) continue;

    for (const g of porEje(tags).genero.slice(0, porArtista)) {
      const v = salida.get(g) ?? {
        name: g,
        primera: a.primera,
        ultima: a.ultima,
        total: 0,
        recientes: 0,
      };
      v.total += a.total;
      v.recientes += a.recientes;
      if (a.primera < v.primera) v.primera = a.primera;
      if (a.ultima > v.ultima) v.ultima = a.ultima;
      salida.set(g, v);
    }
  }

  return salida;
}

/**
 * Los géneros que escuchabas y llevas tiempo sin tocar.
 *
 * Se ordenan por la última vez, de más reciente a más antigua: lo que dejaste
 * de escuchar hace tres meses se reconoce y sorprende, mientras que lo de hace
 * cuatro años ya no es una ausencia, es otra época.
 */
export function dormidos(
  vida: Map<string, VidaGenero>,
  cuantos = 5,
  minimo = MINIMO_PARA_DORMIR,
): VidaGenero[] {
  return [...vida.values()]
    .filter((v) => v.recientes === 0 && v.total >= minimo)
    .sort((a, b) => b.ultima.localeCompare(a.ultima))
    .slice(0, cuantos);
}
