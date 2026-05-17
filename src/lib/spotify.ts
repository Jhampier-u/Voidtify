import { auth } from "@/auth";
import { spotifyLimiter } from "./rate-limiter";

const SPOTIFY_API = "https://api.spotify.com/v1";

export async function spotifyFetch<T>(
  path: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<T> {
  const session = await auth();
  if (!session?.accessToken) throw new Error("Not authenticated");

  const isMutation = init.method && init.method !== "GET";
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
    Authorization: `Bearer ${session.accessToken}`,
    Accept: "application/json",
    "User-Agent": "ledger-app/0.1 (personal-use)",
  };
  if (isMutation) headers["Content-Type"] = "application/json";

  // Wait for the global rate limiter — guarantees we never exceed Spotify's
  // 180 req/30s cap regardless of how many scanners run in parallel.
  await spotifyLimiter.acquire();

  const res = await fetch(`${SPOTIFY_API}${path}`, { ...init, headers });

  // Retry on 429 (rate limit) and 5xx, but only if the wait is short.
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    const retryAfterHeader = res.headers.get("Retry-After");
    const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 0;
    // If Spotify wants us to wait more than 60s, give up and let the user know.
    const MAX_AUTO_WAIT_S = 60;
    if (retryAfterSec > MAX_AUTO_WAIT_S) {
      const minutes = Math.ceil(retryAfterSec / 60);
      const err = new Error(
        `Spotify rate limit: ${minutes} min de espera. Intenta más tarde.`,
      ) as Error & { status?: number; retryAfterSec?: number };
      err.status = 429;
      err.retryAfterSec = retryAfterSec;
      throw err;
    }
    const backoffMs = Math.max(
      retryAfterSec * 1000,
      Math.min(30_000, 500 * 2 ** attempt),
    );
    console.warn(
      `[spotify] ${res.status} on ${path}. Retrying in ${backoffMs}ms (attempt ${attempt + 1}/4)…`,
    );
    await new Promise((r) => setTimeout(r, backoffMs));
    return spotifyFetch<T>(path, init, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Spotify ${res.status}: ${text}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type SpotifyUser = {
  id: string;
  display_name: string;
  email: string;
  images: { url: string }[];
};

export type SpotifyPlaylist = {
  id: string;
  name: string;
  description: string | null;
  images: { url: string }[] | null;
  items: { href: string; total: number };
  owner: { id: string; display_name: string };
  public: boolean;
  collaborative: boolean;
  external_urls: { spotify: string };
};

export type Paged<T> = {
  items: T[];
  total: number;
  next: string | null;
};

export async function getMe() {
  return spotifyFetch<SpotifyUser>("/me", {
    next: { revalidate: 600, tags: ["me"] },
  });
}

export async function getMyPlaylists(limit = 50, offset = 0) {
  return spotifyFetch<Paged<SpotifyPlaylist>>(
    `/me/playlists?limit=${limit}&offset=${offset}`,
    { next: { revalidate: 300, tags: ["playlists-list"] } },
  );
}

export async function getAllMyPlaylists(): Promise<SpotifyPlaylist[]> {
  const first = await getMyPlaylists(50, 0);
  const total = first.total;
  const pages = [first];
  if (total > 50) {
    const restPages = Math.ceil((total - 50) / 50);
    for (let i = 0; i < restPages; i++) {
      pages.push(await getMyPlaylists(50, 50 * (i + 1)));
    }
  }
  const all = pages.flatMap((p) => p.items).filter(Boolean);
  const seen = new Set<string>();
  return all.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

export type SpotifyTrack = {
  id: string | null;
  name: string;
  duration_ms: number;
  explicit: boolean;
  preview_url: string | null;
  uri: string;
  is_local: boolean;
  album: {
    id: string;
    name: string;
    images: { url: string }[];
    release_date: string;
  };
  artists: { id: string; name: string }[];
};

export type PlaylistTrackItem = {
  added_at: string;
  added_by: { id: string } | null;
  is_local: boolean;
  // Feb 2026: field renamed from `track` to `item`. Old key kept as fallback.
  item?: SpotifyTrack | null;
  track?: SpotifyTrack | null;
};

export type PlaylistDetail = SpotifyPlaylist & {
  followers: { total: number };
  description: string | null;
};

export async function getPlaylist(id: string) {
  return spotifyFetch<PlaylistDetail>(`/playlists/${id}`, {
    next: { revalidate: 300, tags: [`playlist-${id}`] },
  });
}

export async function getPlaylistTracks(
  id: string,
  limit = 100,
  offset = 0,
) {
  // Spotify renamed /tracks -> /items in Feb 2026.
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    market: "from_token",
    additional_types: "track,episode",
  });
  return spotifyFetch<Paged<PlaylistTrackItem>>(
    `/playlists/${id}/items?${params}`,
    { next: { revalidate: 300, tags: [`playlist-${id}-items`] } },
  );
}

export async function getAllPlaylistTracks(
  id: string,
): Promise<PlaylistTrackItem[]> {
  const first = await getPlaylistTracks(id, 100, 0);
  const total = first.total;
  const pages = [first];
  if (total > 100) {
    const restPages = Math.ceil((total - 100) / 100);
    for (let i = 0; i < restPages; i++) {
      pages.push(await getPlaylistTracks(id, 100, 100 * (i + 1)));
    }
  }
  return pages.flatMap((p) => p.items);
}

export type SavedTrackItem = {
  added_at: string;
  track: SpotifyTrack;
};

export type SpotifyArtist = {
  id: string;
  name: string;
  genres: string[];
};

/** Single-artist endpoint — bulk /artists?ids was removed in Feb 2026. */
export async function getArtistById(
  id: string,
): Promise<SpotifyArtist | null> {
  try {
    return await spotifyFetch<SpotifyArtist>(`/artists/${id}`, {
      next: { revalidate: 60 * 60 * 24 * 30, tags: [`artist-${id}`] },
    });
  } catch (e) {
    console.warn(`[getArtistById] failed for ${id}:`, e);
    return null;
  }
}

export async function getLikedSongs(limit = 50, offset = 0) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    market: "from_token",
  });
  return spotifyFetch<Paged<SavedTrackItem>>(`/me/tracks?${params}`, {
    next: { revalidate: 300, tags: ["liked-songs"] },
  });
}
