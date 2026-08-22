import { lastfmLimiter } from "./rate-limiter";

const LASTFM_API = "https://ws.audioscrobbler.com/2.0/";
const MAX_TAGS_PER_ARTIST = 6;
// `artist.getInfo` doesn't include a `count` field on tags (only `getTopTags`
// does), but tags arrive in popularity order. We just trust that order.

type LastfmTag = { name: string; count?: number };

type LastfmArtistInfoResponse = {
  artist?: {
    name: string;
    // Last.fm devuelve un array con varios tags, pero un objeto con uno solo.
    tags?: { tag?: LastfmTag | LastfmTag[] };
    // Las cifras llegan como cadenas.
    stats?: { listeners?: string; playcount?: string };
  };
  error?: number;
  message?: string;
};

export type ArtistInfo = {
  tags: string[];
  /** Oyentes en Last.fm, o null si no vinieron. */
  listeners: number | null;
  playcount: number | null;
};

const SIN_INFO: ArtistInfo = { tags: [], listeners: null, playcount: null };

function aNumero(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fetches top tags for an artist from Last.fm. Returns lowercase tag names.
 * Returns [] if not found or on any error (silent fallback).
 */
let warnedMissingKey = false;

/**
 * Etiquetas y popularidad de un artista, en una sola llamada.
 *
 * `listeners` y `playcount` sustituyen al `popularity` que Spotify retiro de
 * sus objetos de artista. Vienen en la misma respuesta que las etiquetas, asi
 * que pedirlos no cuesta ni una peticion mas.
 */
export async function getArtistInfo(name: string): Promise<ArtistInfo> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    if (!warnedMissingKey) {
      console.error(
        "[lastfm] LASTFM_API_KEY not set in env — genre lookup disabled.",
      );
      warnedMissingKey = true;
    }
    return SIN_INFO;
  }
  if (!name?.trim()) return SIN_INFO;

  const params = new URLSearchParams({
    method: "artist.getInfo",
    artist: name,
    api_key: apiKey,
    format: "json",
    autocorrect: "1",
  });

  try {
    await lastfmLimiter.acquire();
    const res = await fetch(`${LASTFM_API}?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`[lastfm] HTTP ${res.status} for "${name}"`);
      return SIN_INFO;
    }
    const data = (await res.json()) as LastfmArtistInfoResponse;
    if (data.error) {
      console.warn(
        `[lastfm] error ${data.error} for "${name}": ${data.message ?? ""}`,
      );
      return SIN_INFO;
    }
    // Normaliza la forma array-u-objeto para que `.slice` nunca lance.
    const raw = data.artist?.tags?.tag;
    const tags = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return {
      tags: tags
        .slice(0, MAX_TAGS_PER_ARTIST)
        .map((t) => t?.name?.toLowerCase().trim() ?? "")
        .filter((t) => t.length > 0 && !GENERIC_TAGS.has(t)),
      listeners: aNumero(data.artist?.stats?.listeners),
      playcount: aNumero(data.artist?.stats?.playcount),
    };
  } catch (e) {
    console.warn(`[lastfm] exception for "${name}":`, e);
    return SIN_INFO;
  }
}

/** Solo las etiquetas. Se conserva porque es lo que usan los consumidores ya escritos. */
export async function getArtistTagsByName(name: string): Promise<string[]> {
  return (await getArtistInfo(name)).tags;
}

// Last.fm has many noisy tags. Filter the most useless.
const GENERIC_TAGS = new Set([
  "seen live",
  "favorites",
  "favourite",
  "favourites",
  "favorite",
  "spotify",
  "all",
  "good",
  "awesome",
  "amazing",
  "love",
  "loved",
  "best",
  "music",
  "favorite artists",
  "favourite artists",
  "my favorites",
  "i love",
]);

type LastfmSimilarTrack = {
  name?: string;
  match?: number | string;
  artist?: { name?: string };
};

type LastfmSimilarResponse = {
  similartracks?: { track?: LastfmSimilarTrack | LastfmSimilarTrack[] };
  error?: number;
  message?: string;
};

/**
 * Temas parecidos a uno dado, según Last.fm.
 *
 * Es el motor del descubrimiento: `/recommendations` de Spotify devuelve 404
 * para esta aplicación desde que retiraron el endpoint, así que el parecido
 * entre canciones ya no puede salir de ahí.
 *
 * Devuelve `[]` ante cualquier problema, igual que `getArtistTagsByName`: un
 * fallo de una semilla debe restar sugerencias, no tumbar la pantalla entera.
 */
export async function getSimilarTracks(
  artist: string,
  track: string,
  limit = 30,
): Promise<{ artista: string; titulo: string; match: number }[]> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey || !artist?.trim() || !track?.trim()) return [];

  const params = new URLSearchParams({
    method: "track.getSimilar",
    artist,
    track,
    limit: String(limit),
    api_key: apiKey,
    format: "json",
    autocorrect: "1",
  });

  try {
    await lastfmLimiter.acquire();
    const res = await fetch(`${LASTFM_API}?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`[lastfm] HTTP ${res.status} en similares de "${track}"`);
      return [];
    }
    const data = (await res.json()) as LastfmSimilarResponse;
    if (data.error) {
      console.warn(`[lastfm] error ${data.error}: ${data.message ?? ""}`);
      return [];
    }

    // Misma forma array-u-objeto que en las etiquetas: con un solo resultado
    // Last.fm devuelve el objeto suelto y `.map` lanzaría.
    const raw = data.similartracks?.track;
    const lista = Array.isArray(raw) ? raw : raw ? [raw] : [];

    return lista
      .map((t) => ({
        artista: t.artist?.name?.trim() ?? "",
        titulo: t.name?.trim() ?? "",
        // El parecido llega unas veces como número y otras como cadena.
        match: typeof t.match === "number" ? t.match : parseFloat(t.match ?? ""),
      }))
      .filter((t) => t.artista && t.titulo && Number.isFinite(t.match));
  } catch (e) {
    console.warn(`[lastfm] excepción en similares de "${track}":`, e);
    return [];
  }
}
