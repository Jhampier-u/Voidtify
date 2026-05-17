const LASTFM_API = "https://ws.audioscrobbler.com/2.0/";
const MAX_TAGS_PER_ARTIST = 6;
// `artist.getInfo` doesn't include a `count` field on tags (only `getTopTags`
// does), but tags arrive in popularity order. We just trust that order.

type LastfmTag = { name: string; count?: number };

type LastfmArtistInfoResponse = {
  artist?: {
    name: string;
    tags?: { tag: LastfmTag[] };
  };
  error?: number;
  message?: string;
};

/**
 * Fetches top tags for an artist from Last.fm. Returns lowercase tag names.
 * Returns [] if not found or on any error (silent fallback).
 */
let warnedMissingKey = false;

export async function getArtistTagsByName(name: string): Promise<string[]> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    if (!warnedMissingKey) {
      console.error(
        "[lastfm] LASTFM_API_KEY not set in env — genre lookup disabled.",
      );
      warnedMissingKey = true;
    }
    return [];
  }
  if (!name?.trim()) return [];

  const params = new URLSearchParams({
    method: "artist.getInfo",
    artist: name,
    api_key: apiKey,
    format: "json",
    autocorrect: "1",
  });

  try {
    const res = await fetch(`${LASTFM_API}?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[lastfm] HTTP ${res.status} for "${name}"`);
      return [];
    }
    const data = (await res.json()) as LastfmArtistInfoResponse;
    if (data.error) {
      console.warn(
        `[lastfm] error ${data.error} for "${name}": ${data.message ?? ""}`,
      );
      return [];
    }
    const tags = data.artist?.tags?.tag ?? [];
    return tags
      .slice(0, MAX_TAGS_PER_ARTIST)
      .map((t) => t.name.toLowerCase().trim())
      .filter((t) => t.length > 0 && !GENERIC_TAGS.has(t));
  } catch (e) {
    console.warn(`[lastfm] exception for "${name}":`, e);
    return [];
  }
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
