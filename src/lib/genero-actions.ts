"use server";

import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { streams } from "@/db/schema";
import { requireSession } from "@/lib/require-session";
import { parseRange } from "@/lib/stats/range";
import { resolveTimeZone } from "@/lib/stats/local-time";
import { enRango } from "@/lib/stats/shared";
import { getGenerosPorClave } from "@/lib/stats/genres";
import { claveEtiqueta, porEje } from "@/lib/stats/etiquetas";

export type Franja = { nombre: string; plays: number; share: number };

export type RitmoDeGenero = {
  franjas: Franja[];
  total: number;
};

/**
 * Las cuatro franjas del día.
 *
 * Cuatro y no veinticuatro: dentro del despliegue de un género hay sitio para
 * una frase, y «lo escuchas de noche» se lee de un vistazo mientras que una
 * curva de veinticuatro puntos de tres centímetros no dice nada.
 */
const FRANJAS: { nombre: string; desde: number; hasta: number }[] = [
  { nombre: "madrugada", desde: 0, hasta: 5 },
  { nombre: "mañana", desde: 6, hasta: 11 },
  { nombre: "tarde", desde: 12, hasta: 19 },
  { nombre: "noche", desde: 20, hasta: 23 },
];

/** Cuántas etiquetas de género se le atribuyen a cada artista. */
const POR_ARTISTA = 3;

/**
 * A qué horas suena un género.
 *
 * Va como acción y no como parte de la portada porque calcularlo para todos los
 * géneros de golpe cuesta unos setecientos milisegundos sobre el historial
 * entero, y es un detalle que solo se mira al desplegar uno. Filtrado a un solo
 * género baja a unos ciento sesenta, y solo se paga cuando se pide.
 *
 * No incluye la tasa de saltos: `skipped` solo viene en las filas del volcado,
 * que se acaba el 26 de julio de 2026, así que sería una tasa calculada sobre
 * un trozo del rango sin que nada lo advirtiera.
 */
export async function getRitmoDeGenero(
  /** La clave del género, no su ortografía: `lofi`, no `lo-fi`. */
  genero: string,
  preset?: string,
  desde?: string,
  hasta?: string,
): Promise<RitmoDeGenero> {
  await requireSession();

  const range = parseRange(
    { preset, desde, hasta },
    Date.now(),
    resolveTimeZone(process.env),
  );

  const porClave = await getGenerosPorClave(db);
  const buscado = claveEtiqueta(genero);
  const claves = [...porClave.entries()]
    .filter(([, tags]) =>
      porEje(tags).genero.slice(0, POR_ARTISTA).includes(buscado),
    )
    .map(([k]) => k);

  if (claves.length === 0) return { franjas: [], total: 0 };

  const fila = db.all<Record<string, number>>(sql`
    SELECT
      ${sql.join(
        FRANJAS.map(
          (f) =>
            sql`SUM(CASE WHEN ${streams.localHour} BETWEEN ${f.desde} AND ${f.hasta} THEN 1 ELSE 0 END) AS ${sql.raw(f.nombre === "mañana" ? "manana" : f.nombre)}`,
        ),
        sql`, `,
      )},
      COUNT(*) AS total
    FROM ${streams}
    WHERE ${enRango(range)} AND ${inArray(streams.artistKey, claves)}
  `)[0];

  const total = fila?.total ?? 0;
  if (total === 0) return { franjas: [], total: 0 };

  return {
    total,
    franjas: FRANJAS.map((f) => {
      const plays = fila[f.nombre === "mañana" ? "manana" : f.nombre] ?? 0;
      return { nombre: f.nombre, plays, share: plays / total };
    }),
  };
}
