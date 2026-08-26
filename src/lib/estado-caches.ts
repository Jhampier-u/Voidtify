import "server-only";
import { sql } from "drizzle-orm";
import {
  artistGenres,
  artistImagen,
  artistStats,
  caratula,
  streams,
} from "@/db/schema";
import { contadas, type Db } from "./stats/shared";

export type EstadoCache = {
  nombre: string;
  /**
   * Cobertura de lo escuchado en los últimos noventa días.
   *
   * Es la cifra que predice si las pantallas se ven completas: los rellenos van
   * por lo más reciente, así que el porcentaje sobre el archivo entero puede ser
   * del dos por ciento mientras todo lo que miras tiene ya su imagen. Dar solo
   * el total sería cierto y desalentador a la vez.
   */
  recientes: number;
  totalRecientes: number;
  /** Lo mismo sobre el archivo completo, que es a donde acaba llegando. */
  resueltos: number;
  total: number;
  /** Qué se está resolviendo y de dónde, para que la cifra signifique algo. */
  nota: string;
};

/** Ventana que define «lo que estás escuchando ahora». */
const RECIENTE_DIAS = 90;

/**
 * Cuánto llevan resuelto las cachés que rellena la captura.
 *
 * Existen cuatro rellenos en segundo plano —géneros, popularidad, fotos de
 * artista y carátulas— y hasta ahora no se veían por ninguna parte. Un trabajo
 * que tarda semanas y no da señal es indistinguible de uno que no funciona: la
 * única forma de saber si avanzaba era consultar la base a mano.
 */
export async function getEstadoCaches(
  db: Db,
  ahoraMs: number,
): Promise<EstadoCache[]> {
  const uno = (q: ReturnType<typeof sql>) =>
    db.all<{ n: number }>(q)[0]?.n ?? 0;

  const desde = new Date(ahoraMs - RECIENTE_DIAS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const reciente = sql`${streams.localDate} >= ${desde}`;

  const artistas = uno(sql`
    SELECT COUNT(DISTINCT ${streams.artistKey}) AS n
    FROM ${streams} WHERE ${contadas()}
  `);
  const canciones = uno(sql`
    SELECT COUNT(DISTINCT ${streams.trackKey}) AS n
    FROM ${streams} WHERE ${contadas()}
  `);
  const albumes = uno(sql`
    SELECT COUNT(DISTINCT ${streams.albumKey}) AS n
    FROM ${streams} WHERE ${contadas()} AND ${streams.albumKey} IS NOT NULL
  `);

  const artistasRec = uno(sql`
    SELECT COUNT(DISTINCT ${streams.artistKey}) AS n
    FROM ${streams} WHERE ${contadas()} AND ${reciente}
  `);
  const cancionesRec = uno(sql`
    SELECT COUNT(DISTINCT ${streams.trackKey}) AS n
    FROM ${streams} WHERE ${contadas()} AND ${reciente}
  `);
  const albumesRec = uno(sql`
    SELECT COUNT(DISTINCT ${streams.albumKey}) AS n
    FROM ${streams}
    WHERE ${contadas()} AND ${reciente} AND ${streams.albumKey} IS NOT NULL
  `);

  // Cada cobertura reciente va explícita en vez de por un ayudante genérico:
  // las tablas no comparten ni el nombre de la clave ni la condición de
  // «resuelto», y armarlas con SQL en crudo sería frágil por ahorrar cuatro
  // líneas.
  const generosRec = uno(sql`
    SELECT COUNT(DISTINCT ${streams.artistKey}) AS n
    FROM ${streams}
    JOIN ${artistGenres} ON ${artistGenres.artistKey} = ${streams.artistKey}
    WHERE ${contadas()} AND ${reciente}
  `);
  const statsRec = uno(sql`
    SELECT COUNT(DISTINCT ${streams.artistKey}) AS n
    FROM ${streams}
    JOIN ${artistStats} ON ${artistStats.artistKey} = ${streams.artistKey}
    WHERE ${contadas()} AND ${reciente} AND ${artistStats.listeners} IS NOT NULL
  `);
  const fotosRec = uno(sql`
    SELECT COUNT(DISTINCT ${streams.artistKey}) AS n
    FROM ${streams}
    JOIN ${artistImagen} ON ${artistImagen.artistKey} = ${streams.artistKey}
    WHERE ${contadas()} AND ${reciente} AND ${artistImagen.url} IS NOT NULL
  `);
  const cancionesCarRec = uno(sql`
    SELECT COUNT(DISTINCT ${streams.trackKey}) AS n
    FROM ${streams}
    JOIN ${caratula}
      ON ${caratula.clave} = ${streams.trackKey} AND ${caratula.tipo} = 'cancion'
    WHERE ${contadas()} AND ${reciente} AND ${caratula.url} IS NOT NULL
  `);
  const albumesCarRec = uno(sql`
    SELECT COUNT(DISTINCT ${streams.albumKey}) AS n
    FROM ${streams}
    JOIN ${caratula}
      ON ${caratula.clave} = ${streams.albumKey} AND ${caratula.tipo} = 'album'
    WHERE ${contadas()} AND ${reciente} AND ${caratula.url} IS NOT NULL
  `);

  return [
    {
      nombre: "Géneros",
      recientes: generosRec,
      totalRecientes: artistasRec,
      resueltos: uno(sql`SELECT COUNT(*) AS n FROM ${artistGenres}`),
      total: artistas,
      nota: "etiquetas de Last.fm, 20 artistas por captura",
    },
    {
      nombre: "Popularidad",
      recientes: statsRec,
      totalRecientes: artistasRec,
      resueltos: uno(
        sql`SELECT COUNT(*) AS n FROM ${artistStats} WHERE ${artistStats.listeners} IS NOT NULL`,
      ),
      total: artistas,
      nota: "oyentes en Last.fm, en la misma llamada que los géneros",
    },
    {
      nombre: "Fotos de artista",
      recientes: fotosRec,
      totalRecientes: artistasRec,
      resueltos: uno(
        sql`SELECT COUNT(*) AS n FROM ${artistImagen} WHERE ${artistImagen.url} IS NOT NULL`,
      ),
      total: artistas,
      nota: "búsqueda en Spotify por nombre, 15 por captura",
    },
    {
      nombre: "Carátulas de canción",
      recientes: cancionesCarRec,
      totalRecientes: cancionesRec,
      resueltos: uno(
        sql`SELECT COUNT(*) AS n FROM ${caratula} WHERE ${caratula.tipo} = 'cancion' AND ${caratula.url} IS NOT NULL`,
      ),
      total: canciones,
      nota: "por lo último escuchado, 15 por captura",
    },
    {
      nombre: "Carátulas de álbum",
      recientes: albumesCarRec,
      totalRecientes: albumesRec,
      resueltos: uno(
        sql`SELECT COUNT(*) AS n FROM ${caratula} WHERE ${caratula.tipo} = 'album' AND ${caratula.url} IS NOT NULL`,
      ),
      total: albumes,
      nota: "sale del álbum de una de sus pistas",
    },
  ];
}
