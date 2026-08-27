import "server-only";
import { sql } from "drizzle-orm";
import { descubrimientoVisto, streams } from "@/db/schema";
import {
  getArtistTopTracks,
  getSimilarArtists,
  getSimilarTracks,
  getTagTopTracks,
} from "@/lib/lastfm";
import { getTopTracks } from "@/lib/stats/tops";
import { albumKey, artistKey } from "@/lib/stats/normalize";
import type { StatsRange } from "@/lib/stats/range";
import type { Db } from "@/lib/stats/shared";
import { mezclar, type Candidato, type Rama } from "./mezcla";
import {
  etiquetaDeSemilla,
  ramasDePistas,
  type PistaSemilla,
  type Semilla,
} from "./semillas";

/**
 * Cuántas de tus canciones se usan como semilla en el modo «tops».
 *
 * Cada una es una llamada a Last.fm, y el limitador las espacia 220 ms: doce
 * semillas son menos de tres segundos. Subirlo mucho alarga la espera sin
 * mejorar gran cosa, porque las sugerencias empiezan a repetirse.
 */
const SEMILLAS = 12;

/** Sugerencias que se piden por semilla. */
const POR_SEMILLA = 30;

/** Artistas parecidos que se exploran al partir de un artista. */
const PARECIDOS = 8;

/** Temas que se toman de cada artista parecido. */
const TEMAS_POR_PARECIDO = 6;

export type Descubrimiento = {
  candidatos: Candidato[];
  /** De dónde salió todo, para poder explicarlo en pantalla. */
  semillas: string[];
};

/**
 * Lo ya escuchado y lo ya decidido, para no proponerlo.
 *
 * Se traen las claves distintas, no las filas: son decenas de miles frente a
 * cientos de miles, y el conjunto tiene que caber en memoria.
 *
 * Lo visto en Descubrir entra en el mismo saco que lo escuchado. Da igual que
 * lo pasaras o que lo guardaras: en los dos casos ya diste una respuesta, y
 * volver a enseñarlo es hacerte revisar lo mismo. Antes no se guardaba nada y
 * cada búsqueda repetía las mismas cuarenta.
 */
function conocido(db: Db): {
  canciones: Set<string>;
  artistas: Set<string>;
} {
  const t = db.all<{ clave: string }>(
    sql`SELECT DISTINCT ${streams.trackKey} AS clave FROM ${streams}`,
  );
  const a = db.all<{ clave: string }>(
    sql`SELECT DISTINCT ${streams.artistKey} AS clave FROM ${streams}`,
  );
  const v = db.all<{ clave: string }>(
    sql`SELECT ${descubrimientoVisto.clave} AS clave FROM ${descubrimientoVisto}`,
  );
  return {
    canciones: new Set([...t.map((r) => r.clave), ...v.map((r) => r.clave)]),
    artistas: new Set(a.map((r) => r.clave)),
  };
}

/** Las canciones de un álbum tuyo, que sirven de semilla para ese álbum. */
function pistasDelAlbum(db: Db, artista: string, titulo: string): PistaSemilla[] {
  const clave = albumKey(artista, titulo);
  return db.all<PistaSemilla>(sql`
    SELECT
      MAX(${streams.artistName}) AS artista,
      MAX(${streams.trackName})  AS titulo
    FROM ${streams}
    WHERE ${streams.albumKey} = ${clave}
    GROUP BY ${streams.trackKey}
    ORDER BY COUNT(*) DESC
    LIMIT 8
  `);
}

/**
 * Las ramas que produce cada tipo de semilla.
 *
 * Un artista no se resuelve como una canción a propósito. Pedir parecidos de
 * sus temas devolvería sobre todo más temas del mismo artista y de sus vecinos
 * inmediatos; partir de `artist.getSimilar` y bajar a los temas de cada
 * parecido devuelve nombres nuevos, que es lo que se busca al escribir un
 * artista en el buscador.
 */
async function ramasDe(
  db: Db,
  semilla: Semilla,
  range: StatsRange,
  pistasDePlaylist: PistaSemilla[],
): Promise<{ ramas: Rama[]; semillas: string[] }> {
  const porPista = (pistas: PistaSemilla[], origen: (p: PistaSemilla) => string) =>
    ramasDePistas(
      pistas,
      (p) => getSimilarTracks(p.artista, p.titulo, POR_SEMILLA),
      origen,
    );

  switch (semilla.tipo) {
    case "tops": {
      const top = await getTopTracks(db, range, "plays", SEMILLAS);
      const pistas = top.map((t) => ({ artista: t.artistName, titulo: t.name }));
      return {
        ramas: await porPista(pistas, (p) => `${p.titulo} — ${p.artista}`),
        semillas: pistas.map((p) => `${p.titulo} — ${p.artista}`),
      };
    }

    case "cancion": {
      const pistas = [{ artista: semilla.artista, titulo: semilla.titulo }];
      return {
        ramas: await porPista(pistas, () => etiquetaDeSemilla(semilla)),
        semillas: [etiquetaDeSemilla(semilla)],
      };
    }

    case "album": {
      const pistas = pistasDelAlbum(db, semilla.artista, semilla.titulo);
      return {
        ramas: await porPista(pistas, () => etiquetaDeSemilla(semilla)),
        semillas: pistas.map((p) => p.titulo),
      };
    }

    case "playlist": {
      return {
        ramas: await porPista(pistasDePlaylist, () => etiquetaDeSemilla(semilla)),
        semillas: pistasDePlaylist.map((p) => `${p.titulo} — ${p.artista}`),
      };
    }

    case "artista": {
      const parecidos = (await getSimilarArtists(semilla.nombre, PARECIDOS)).slice(
        0,
        PARECIDOS,
      );
      const ramas: Rama[] = [];
      for (const p of parecidos) {
        const temas = await getArtistTopTracks(p.nombre, TEMAS_POR_PARECIDO);
        ramas.push({
          origen: semilla.nombre,
          // El parecido del artista se hereda a todos sus temas: Last.fm no da
          // uno por tema aquí, y usar cero dejaría al desempate alfabético
          // decidiendo el orden de la lista entera.
          entradas: temas.map((t) => ({ ...t, match: p.match })),
        });
      }
      return { ramas, semillas: parecidos.map((p) => p.nombre) };
    }

    case "genero": {
      const temas = await getTagTopTracks(semilla.nombre, 60);
      return {
        ramas: [{ origen: semilla.nombre, entradas: temas }],
        semillas: [semilla.nombre],
      };
    }
  }
}

/**
 * Propone canciones que no has escuchado, a partir de la semilla que se pida.
 *
 * El motor es Last.fm porque `/recommendations` de Spotify devuelve 404 desde
 * que lo retiraron. A cambio tenemos algo que ningún motor ajeno tiene: el
 * historial completo, que sirve para descartar todo lo ya conocido en vez de
 * devolverte tus propios éxitos disfrazados de novedad.
 */
export async function descubrir(
  db: Db,
  range: StatsRange,
  limite = 40,
  semilla: Semilla = { tipo: "tops" },
  /** Pistas de la playlist, ya resueltas fuera: aquí no se habla con Spotify. */
  pistasDePlaylist: PistaSemilla[] = [],
): Promise<Descubrimiento> {
  const { ramas, semillas } = await ramasDe(db, semilla, range, pistasDePlaylist);
  if (ramas.length === 0) return { candidatos: [], semillas: [] };

  const { canciones, artistas } = conocido(db);

  return {
    candidatos: mezclar(ramas, canciones, artistas, limite),
    semillas,
  };
}

/** Reexportado para que la acción no tenga que conocer dos módulos. */
export { artistKey };
