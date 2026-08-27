"use server";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { artistImagen, caratula, streams } from "@/db/schema";
import { requireSession } from "./require-session";
import { spotifyFetch } from "./spotify";
import { artistKey, trackKey } from "./stats/normalize";
import {
  guardarCaratula,
  mejorCaratula,
} from "./capture/rellenar-caratulas";
import { getCaratulas } from "./stats/imagenes";
import { getCanon, getGenerosPorClave } from "./stats/genres";
import { porEje } from "./stats/etiquetas";
import { contadas } from "./stats/shared";
import { parseRange } from "./stats/range";
import { resolveTimeZone } from "./stats/local-time";
import { descubrir } from "./descubrir/candidatos";
import {
  etiquetaDeSemilla,
  semillaDeParams,
} from "./descubrir/semillas";
import { resolverUris } from "./descubrir/resolver";
import type { Candidato } from "./descubrir/mezcla";

export type Sugerencia = Candidato & { uri: string; caratula?: string };

export type Dispositivo = {
  id: string;
  nombre: string;
  tipo: string;
  activo: boolean;
};

type BusquedaSpotify = {
  tracks?: {
    items?: {
      uri: string;
      name: string;
      artists: { name: string }[];
      album?: { images?: { url: string; width?: number }[] };
    }[];
  };
};

/**
 * Busca un tema de Last.fm en el catálogo de Spotify.
 *
 * Comprueba que el artista devuelto es el que se pidió. Sin esa comprobación,
 * una búsqueda que no encuentra el tema exacto devuelve lo más parecido que
 * haya —una versión, un homónimo, un remix ajeno— y acabaría colándose en la
 * playlist como si fuera lo pedido. Es preferible decir que no está.
 */
async function buscarEnSpotify(
  artista: string,
  titulo: string,
): Promise<string | null> {
  const q = encodeURIComponent(`${titulo} ${artista}`);
  const datos = await spotifyFetch<BusquedaSpotify>(
    `/search?q=${q}&type=track&limit=5`,
    { cache: "no-store" },
  );

  const esperado = artistKey(artista);
  for (const t of datos.tracks?.items ?? []) {
    if (!t.artists.some((a) => artistKey(a.name) === esperado)) continue;

    // La respuesta trae la caratula y se estaba tirando. Guardarla aqui evita
    // una peticion mas por cancion, y ademas queda para la proxima: estas
    // sugerencias son temas que aun no has escuchado, asi que no hay ninguna
    // otra via por la que su caratula llegue a la cache.
    const url = mejorCaratula({ uri: t.uri, album: t.album });
    if (url) {
      try {
        await guardarCaratula(db, "cancion", trackKey(artista, titulo), url, Date.now());
      } catch {
        // Sin caratula la sugerencia sigue siendo util; no vale la pena
        // tumbar la busqueda por no poder cachear una imagen.
      }
    }
    return t.uri;
  }
  return null;
}

/**
 * Propone canciones que no has escuchado y las traduce a URIs reproducibles.
 *
 * Solo devuelve las que existen en Spotify: una sugerencia que no se puede
 * escuchar ni añadir a una playlist no sirve de nada en esta pantalla.
 */
/** Cuántas pistas de una playlist se usan como semilla. */
const PISTAS_DE_PLAYLIST = 10;

/**
 * Las primeras pistas de una playlist, para usarlas de semilla.
 *
 * Vive aquí y no en el motor a propósito: `candidatos.ts` no habla con Spotify,
 * así que se puede probar entero sin inventar respuestas HTTP.
 */
async function pistasDePlaylist(id: string) {
  const d = await spotifyFetch<{
    items?: { track?: { name?: string; artists?: { name?: string }[] } | null }[];
  }>(`/playlists/${id}/tracks?limit=${PISTAS_DE_PLAYLIST}`, { cache: "no-store" });

  return (d.items ?? [])
    .map((i) => ({
      artista: i.track?.artists?.[0]?.name?.trim() ?? "",
      titulo: i.track?.name?.trim() ?? "",
    }))
    .filter((p) => p.artista && p.titulo);
}

export async function obtenerSugerencias(
  preset?: string,
  limite = 40,
  semillaParams?: { tipo?: string; a?: string; b?: string },
): Promise<{ sugerencias: Sugerencia[]; semillas: string[]; etiqueta: string }> {
  await requireSession();

  const range = parseRange({ preset }, Date.now(), resolveTimeZone(process.env));
  const semilla = semillaDeParams(semillaParams ?? {});
  const pistas =
    semilla.tipo === "playlist" ? await pistasDePlaylist(semilla.id) : [];

  const { candidatos, semillas } = await descubrir(
    db,
    range,
    limite,
    semilla,
    pistas,
  );

  const uris = await resolverUris(
    db,
    candidatos.map((c) => ({
      clave: c.clave,
      artista: c.artista,
      titulo: c.titulo,
    })),
    buscarEnSpotify,
    Date.now(),
  );

  // Se leen despues de resolver: las que se acaban de buscar quedaron
  // guardadas por el camino, y las que venian de la cache pueden tenerla de una
  // tanda anterior.
  const caratulas = await getCaratulas(
    db,
    "cancion",
    candidatos.map((c) => c.clave),
  );

  const sugerencias: Sugerencia[] = [];
  for (const c of candidatos) {
    const uri = uris.get(c.clave);
    if (uri) sugerencias.push({ ...c, uri, caratula: caratulas[c.clave] });
  }

  return { sugerencias, semillas, etiqueta: etiquetaDeSemilla(semilla) };
}

export async function listarDispositivos(): Promise<Dispositivo[]> {
  await requireSession();
  const d = await spotifyFetch<{
    devices?: { id: string | null; name: string; type: string; is_active: boolean }[];
  }>("/me/player/devices", { cache: "no-store" });

  return (d.devices ?? [])
    .filter((x): x is typeof x & { id: string } => Boolean(x.id))
    .map((x) => ({
      id: x.id,
      nombre: x.name,
      tipo: x.type,
      activo: x.is_active,
    }));
}

/**
 * Pone a sonar una canción en uno de tus dispositivos.
 *
 * Se usa Connect en vez del Web Playback SDK: suena en el equipo, el móvil o
 * el altavoz que ya tienes abiertos, sin cargar un script externo ni lidiar
 * con DRM en el navegador. Requiere Premium, igual que el SDK.
 */
export async function reproducir(uri: string, dispositivoId: string) {
  await requireSession();
  await spotifyFetch(`/me/player/play?device_id=${dispositivoId}`, {
    method: "PUT",
    body: JSON.stringify({ uris: [uri] }),
  });
}

export type OpcionSemilla = {
  tipo: "artista" | "cancion" | "album" | "genero" | "playlist";
  /** Lo que se enseña. */
  nombre: string;
  /** El artista, en canciones y álbumes; el dueño, en playlists. */
  detalle?: string;
  /** Lo que viaja a la url: `a` y `b` de la semilla. */
  a: string;
  b?: string;
  imagen?: string;
};

/** Cuántas opciones se devuelven de cada tipo. */
const POR_TIPO = 4;

/**
 * Busca semillas entre lo tuyo: artistas, canciones, álbumes, géneros y
 * playlists.
 *
 * Solo sobre tu propio historial, no sobre el catálogo de Spotify. Descubrir a
 * partir de algo que nunca has escuchado es una pregunta legítima, pero otra
 * distinta: aquí la idea es «dame más de esto que ya sé que me gusta», y
 * buscar en el catálogo entero llenaría la lista de nombres que no reconoces.
 */
export async function buscarSemillas(consulta: string): Promise<OpcionSemilla[]> {
  await requireSession();

  const q = consulta.trim().toLowerCase();
  if (q.length < 2) return [];
  const patron = `%${q}%`;

  const artistas = db.all<{ nombre: string; imagen: string | null }>(sql`
    SELECT MAX(${streams.artistName}) AS nombre, ${artistImagen.url} AS imagen
    FROM ${streams}
    LEFT JOIN ${artistImagen} ON ${artistImagen.artistKey} = ${streams.artistKey}
    WHERE ${contadas()} AND lower(${streams.artistName}) LIKE ${patron}
    GROUP BY ${streams.artistKey}
    ORDER BY COUNT(*) DESC
    LIMIT ${POR_TIPO}
  `);

  const canciones = db.all<{ nombre: string; detalle: string; imagen: string | null }>(sql`
    SELECT
      MAX(${streams.trackName})  AS nombre,
      MAX(${streams.artistName}) AS detalle,
      ${caratula.url}            AS imagen
    FROM ${streams}
    LEFT JOIN ${caratula}
      ON ${caratula.clave} = ${streams.trackKey} AND ${caratula.tipo} = 'cancion'
    WHERE ${contadas()} AND lower(${streams.trackName}) LIKE ${patron}
    GROUP BY ${streams.trackKey}
    ORDER BY COUNT(*) DESC
    LIMIT ${POR_TIPO}
  `);

  const albumes = db.all<{ nombre: string; detalle: string; imagen: string | null }>(sql`
    SELECT
      MAX(${streams.albumName})  AS nombre,
      MAX(${streams.artistName}) AS detalle,
      ${caratula.url}            AS imagen
    FROM ${streams}
    LEFT JOIN ${caratula}
      ON ${caratula.clave} = ${streams.albumKey} AND ${caratula.tipo} = 'album'
    WHERE ${contadas()} AND ${streams.albumKey} IS NOT NULL
      AND lower(${streams.albumName}) LIKE ${patron}
    GROUP BY ${streams.albumKey}
    ORDER BY COUNT(*) DESC
    LIMIT ${POR_TIPO}
  `);

  // Los géneros salen de la cache de etiquetas, ya canonizada: asi «lo-fi» y
  // «lo fi» no aparecen como dos opciones distintas.
  const canon = await getCanon(db);
  const porClave = await getGenerosPorClave(db);
  const generos = new Map<string, number>();
  for (const tags of porClave.values()) {
    for (const clave of porEje(tags).genero.slice(0, 3)) {
      generos.set(clave, (generos.get(clave) ?? 0) + 1);
    }
  }
  const opcionesGenero = [...generos.entries()]
    .map(([clave, n]) => ({ nombre: canon.nombre(clave), n }))
    .filter((g) => g.nombre.toLowerCase().includes(q))
    .sort((a, b) => b.n - a.n)
    .slice(0, POR_TIPO);

  const playlists = await buscarPlaylistsPropias(q);

  return [
    ...artistas.map((a): OpcionSemilla => ({
      tipo: "artista", nombre: a.nombre, a: a.nombre,
      imagen: a.imagen ?? undefined,
    })),
    ...canciones.map((c): OpcionSemilla => ({
      tipo: "cancion", nombre: c.nombre, detalle: c.detalle,
      a: c.detalle, b: c.nombre, imagen: c.imagen ?? undefined,
    })),
    ...albumes.map((al): OpcionSemilla => ({
      tipo: "album", nombre: al.nombre, detalle: al.detalle,
      a: al.detalle, b: al.nombre, imagen: al.imagen ?? undefined,
    })),
    ...opcionesGenero.map((g): OpcionSemilla => ({
      tipo: "genero", nombre: g.nombre, a: g.nombre,
    })),
    ...playlists,
  ];
}

/** Tus playlists cuyo nombre contenga la consulta. */
async function buscarPlaylistsPropias(q: string): Promise<OpcionSemilla[]> {
  try {
    const d = await spotifyFetch<{
      items?: {
        id: string;
        name: string;
        images?: { url: string }[] | null;
        tracks?: { total?: number };
      }[];
    }>("/me/playlists?limit=50", { cache: "no-store" });

    return (d.items ?? [])
      .filter((p) => p.name?.toLowerCase().includes(q))
      .slice(0, POR_TIPO)
      .map((p) => ({
        tipo: "playlist" as const,
        nombre: p.name,
        detalle: p.tracks?.total ? `${p.tracks.total} canciones` : undefined,
        a: p.id,
        b: p.name,
        imagen: p.images?.[0]?.url,
      }));
  } catch {
    // Que Spotify no responda no debe vaciar el buscador: lo tuyo local sigue.
    return [];
  }
}
