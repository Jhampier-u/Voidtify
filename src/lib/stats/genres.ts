import { inArray, sql } from "drizzle-orm";
import { artistGenres, artistStats, streams } from "@/db/schema";
import type { StatsRange } from "./range";
import { contadas, enRango, type Db } from "./shared";
import { porEje, type Eje } from "./etiquetas";

export type ArtistaDeEtiqueta = {
  key: string;
  name: string;
  plays: number;
};

export type EntradaEtiqueta = {
  name: string;
  /** Reproducciones atribuidas a esta etiqueta. */
  plays: number;
  /**
   * Proporción de escucha sobre el total atribuido en su eje, entre 0 y 1.
   *
   * Es la cifra buena para los géneros, que es donde la pregunta es «cuánto de
   * lo que suena es esto». En los ejes pequeños miente: la mayoría de artistas
   * no lleva ninguna etiqueta de época, así que «80s 77 %» no dice que tres de
   * cada cuatro canciones sean de los ochenta, sino que tres de cada cuatro
   * *etiquetas de época* lo son. Para esos va `shareArtistas`.
   */
  share: number;
  /** Cuántos de tus artistas la llevan. */
  artistas: number;
  /**
   * Qué parte de tus artistas etiquetados la lleva, entre 0 y 1.
   *
   * El denominador son todos los artistas con etiquetas, no los que tienen una
   * de este eje. Así «el 12 % de tus artistas está marcado como 80s» es cierto
   * tal cual está escrito.
   */
  shareArtistas: number;
  /** Los que más aportan, para poder abrir la etiqueta. */
  top: ArtistaDeEtiqueta[];
  /**
   * Mediana de oyentes en Last.fm de sus artistas, o null si no se sabe.
   *
   * Mediana y no media: un solo artista enorme dentro de un género de nicho
   * arrastraría la media hasta hacerla mentir.
   */
  oyentes: number | null;
};

export type GenreBreakdown = {
  generos: EntradaEtiqueta[];
  epocas: EntradaEtiqueta[];
  procedencias: EntradaEtiqueta[];
  voces: EntradaEtiqueta[];
  /** Artistas del rango que se han mirado. */
  analizados: number;
  /** De ellos, cuántos tienen al menos una etiqueta. */
  conEtiquetas: number;
  /**
   * Consultados a Last.fm y sin ninguna etiqueta suya.
   *
   * Están terminados: volver a preguntar daría lo mismo. Contarlos como
   * pendientes era lo que hacía que la pantalla dijera «quedan 6 por resolver»
   * mientras el botón no encontraba ni un candidato.
   */
  sinEtiquetas: number;
  /** Sin consultar todavía. Estos sí los puede adelantar el botón. */
  pendientes: number;
};

/**
 * Cuántos artistas se miran para componer el reparto.
 *
 * Eran trescientos, y el número se puso cuando había cuarenta artistas
 * resueltos de diez mil seiscientos: pedir más habría sido pedir huecos. Hoy
 * hay más de tres mil en caché, y en un rango de cuatro semanas los artistas
 * escuchados están cubiertos al cien por cien. Subirlo no cuesta ni una
 * petición y deja de ser una aproximación sobre una minoría.
 */
export const PROFUNDIDAD = 1000;

/**
 * Cuántas etiquetas de cada eje se le atribuyen a un artista.
 *
 * Las de Last.fm llegan de más a menos usada, y la cola es ruido: el cuarto o
 * quinto género de un artista suele ser una etiqueta que puso una persona.
 */
const POR_ARTISTA = 3;

function parseGeneros(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 === 0 ? Math.round((o[m - 1] + o[m]) / 2) : o[m];
}

type Acumulado = {
  plays: number;
  artistas: ArtistaDeEtiqueta[];
  oyentes: number[];
};

/** Cuántos artistas se guardan por etiqueta para poder abrirla. */
const TOP_POR_ETIQUETA = 12;

function componer(
  acumulado: Map<string, Acumulado>,
  limite: number,
  conEtiquetas: number,
): EntradaEtiqueta[] {
  const total = [...acumulado.values()].reduce((n, v) => n + v.plays, 0);

  return [...acumulado.entries()]
    .map(([name, v]) => ({
      name,
      plays: v.plays,
      artistas: v.artistas.length,
      share: total === 0 ? 0 : v.plays / total,
      shareArtistas: conEtiquetas === 0 ? 0 : v.artistas.length / conEtiquetas,
      top: [...v.artistas]
        .sort((a, b) => b.plays - a.plays)
        .slice(0, TOP_POR_ETIQUETA),
      oyentes: mediana(v.oyentes),
    }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, limite);
}

/**
 * Reparto de etiquetas del rango, ponderado por reproducciones y por eje.
 *
 * Cada artista aporta sus reproducciones a sus primeras etiquetas de cada eje.
 * No se divide entre ellas: alguien que escucha shoegaze escucha las tres
 * etiquetas del artista a la vez, y repartir la cifra haría que los totales no
 * sumaran nada interpretable. Por eso `share` va sobre el total atribuido
 * dentro de su eje y no sobre las reproducciones del rango.
 *
 * Los ejes van separados porque las etiquetas de Last.fm no son un vocabulario
 * de géneros: una de cada ocho es una década, un país o un tipo de voz. Juntas,
 * «female vocalists» le quitaba el puesto ocho a un género de verdad.
 */
export async function getGenreBreakdown(
  db: Db,
  range: StatsRange,
  /**
   * Cuántos géneros se enseñan.
   *
   * Eran doce y se quedaban cortos: con mil artistas analizados hay 238 géneros
   * distintos en cuatro semanas y más de cuatrocientos en el historial, y doce
   * cubren solo entre el 55 y el 65 % de lo atribuido. Lo que se quedaba fuera
   * era además lo más característico —coldwave, 8-bit, space rock, noise pop—
   * mientras dentro sobrevivían «pop» y «rock». Veinticuatro llegan al 80 %.
   */
  limite = 24,
): Promise<GenreBreakdown> {
  const top = db.all<{ key: string; name: string; plays: number }>(sql`
    SELECT
      ${streams.artistKey}       AS key,
      MAX(${streams.artistName}) AS name,
      COUNT(*)                   AS plays
    FROM ${streams}
    WHERE ${enRango(range)} AND ${contadas()}
    GROUP BY ${streams.artistKey}
    ORDER BY plays DESC
    LIMIT ${PROFUNDIDAD}
  `);

  const vacio: GenreBreakdown = {
    generos: [], epocas: [], procedencias: [], voces: [],
    analizados: 0, conEtiquetas: 0, sinEtiquetas: 0, pendientes: 0,
  };
  if (top.length === 0) return vacio;

  const claves = top.map((a) => a.key);

  const [cacheados, popularidad] = await Promise.all([
    db.select().from(artistGenres).where(inArray(artistGenres.artistKey, claves)),
    db.select().from(artistStats).where(inArray(artistStats.artistKey, claves)),
  ]);

  const porClave = new Map(
    cacheados.map((c) => [c.artistKey, parseGeneros(c.genres)]),
  );
  const oyentesDe = new Map(
    popularidad
      .filter((p) => p.listeners !== null)
      .map((p) => [p.artistKey, p.listeners as number]),
  );

  const ejes: Record<Eje, Map<string, Acumulado>> = {
    genero: new Map(), epoca: new Map(), procedencia: new Map(),
    voz: new Map(), otros: new Map(),
  };

  let conEtiquetas = 0;
  let sinEtiquetas = 0;
  let pendientes = 0;

  for (const a of top) {
    const tags = porClave.get(a.key);

    // Sin fila es «aún no preguntado»; con fila vacía es «preguntado y Last.fm
    // no tiene nada». Confundirlos era el origen del botón que no hacía nada.
    if (tags === undefined) {
      pendientes += 1;
      continue;
    }
    if (tags.length === 0) {
      sinEtiquetas += 1;
      continue;
    }
    conEtiquetas += 1;

    const oyentes = oyentesDe.get(a.key);
    const repartidas = porEje(tags);

    for (const eje of ["genero", "epoca", "procedencia", "voz"] as Eje[]) {
      for (const etiqueta of repartidas[eje].slice(0, POR_ARTISTA)) {
        const acc = ejes[eje].get(etiqueta) ?? {
          plays: 0, artistas: [], oyentes: [],
        };
        acc.plays += a.plays;
        acc.artistas.push({ key: a.key, name: a.name, plays: a.plays });
        if (oyentes !== undefined) acc.oyentes.push(oyentes);
        ejes[eje].set(etiqueta, acc);
      }
    }
  }

  return {
    generos: componer(ejes.genero, limite, conEtiquetas),
    // Los otros tres ejes tienen un vocabulario mucho más corto y no compiten
    // por el sitio: con seis se ve el reparto entero sin ocupar media pantalla.
    epocas: componer(ejes.epoca, 6, conEtiquetas),
    procedencias: componer(ejes.procedencia, 6, conEtiquetas),
    voces: componer(ejes.voz, 2, conEtiquetas),
    analizados: top.length,
    conEtiquetas,
    sinEtiquetas,
    pendientes,
  };
}

/**
 * Artistas del rango que aún no se han consultado a Last.fm.
 *
 * Devuelve la clave y el nombre tal como se escribió, porque Last.fm se
 * consulta por nombre legible, no por la clave normalizada.
 *
 * Deja fuera a los que ya tienen fila, aunque esté vacía: esos están
 * terminados. La pantalla los cuenta aparte para no prometer un trabajo que
 * este listado no va a devolver nunca.
 */
export async function getArtistasSinGeneros(
  db: Db,
  range: StatsRange,
  limite = PROFUNDIDAD,
): Promise<{ key: string; name: string }[]> {
  return db.all<{ key: string; name: string }>(sql`
    SELECT
      ${streams.artistKey}       AS key,
      MAX(${streams.artistName}) AS name
    FROM ${streams}
    WHERE ${enRango(range)} AND ${contadas()}
      AND ${streams.artistKey} NOT IN (SELECT artist_key FROM artist_genres)
    GROUP BY ${streams.artistKey}
    ORDER BY COUNT(*) DESC
    LIMIT ${limite}
  `);
}

/** Guarda los géneros de un artista, incluso si vinieron vacíos. */
export async function guardarGeneros(
  db: Db,
  artistKey: string,
  generos: string[],
): Promise<void> {
  const valores = {
    artistKey,
    genres: JSON.stringify(generos),
    fetchedAt: Date.now(),
  };

  // Se cachea también el resultado vacío: sin esto, un artista que Last.fm no
  // conoce se reintentaría en cada pasada, para siempre.
  await db
    .insert(artistGenres)
    .values(valores)
    .onConflictDoUpdate({ target: artistGenres.artistKey, set: valores });
}

/**
 * Las etiquetas cacheadas de todos los artistas, por clave.
 *
 * Sin filtrar por rango: son poco más de tres mil filas y traerlas enteras sale
 * más barato que atar mil claves en un `IN`, que obliga a SQLite a una búsqueda
 * por índice por cada una.
 */
export async function getGenerosPorClave(db: Db): Promise<Map<string, string[]>> {
  const filas = await db.select().from(artistGenres);
  return new Map(filas.map((f) => [f.artistKey, parseGeneros(f.genres)]));
}
