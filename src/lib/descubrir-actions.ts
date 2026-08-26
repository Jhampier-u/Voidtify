"use server";

import { db } from "@/db";
import { requireSession } from "./require-session";
import { spotifyFetch } from "./spotify";
import { artistKey, trackKey } from "./stats/normalize";
import {
  guardarCaratula,
  mejorCaratula,
} from "./capture/rellenar-caratulas";
import { getCaratulas } from "./stats/imagenes";
import { parseRange } from "./stats/range";
import { resolveTimeZone } from "./stats/local-time";
import { descubrir } from "./descubrir/candidatos";
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
export async function obtenerSugerencias(
  preset?: string,
  limite = 40,
): Promise<{ sugerencias: Sugerencia[]; semillas: string[] }> {
  await requireSession();

  const range = parseRange({ preset }, Date.now(), resolveTimeZone(process.env));
  const { candidatos, semillas } = await descubrir(db, range, limite);

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

  return {
    sugerencias,
    semillas: semillas.map((s) => `${s.titulo} — ${s.artista}`),
  };
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
