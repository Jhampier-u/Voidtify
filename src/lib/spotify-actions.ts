"use server";

import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
  spotifyFetch,
  getPlaylistTracks,
  getLikedSongs,
  type SpotifyPlaylist,
  type PlaylistTrackItem,
  type SavedTrackItem,
} from "./spotify";

const CHUNK = 100;

function chunked<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function invalidatePlaylist(id: string) {
  revalidateTag(`playlist-${id}`);
  revalidateTag(`playlist-${id}-items`);
  revalidateTag("playlists-list");
}

export async function removeTracksFromPlaylist(
  playlistId: string,
  uris: string[],
) {
  // Spotify Feb 2026: body field is `items` with objects `{uri}`.
  for (const chunk of chunked(uris)) {
    await spotifyFetch(`/playlists/${playlistId}/items`, {
      method: "DELETE",
      body: JSON.stringify({
        items: chunk.map((uri) => ({ uri })),
      }),
    });
  }
  invalidatePlaylist(playlistId);
}

export async function addTracksToPlaylist(
  playlistId: string,
  uris: string[],
) {
  for (const chunk of chunked(uris)) {
    await spotifyFetch(`/playlists/${playlistId}/items`, {
      method: "POST",
      body: JSON.stringify({ uris: chunk }),
    });
  }
  invalidatePlaylist(playlistId);
}

/**
 * Moves a single track from one position to another within a playlist.
 * Uses Spotify's range-based reorder semantics: range_start is the index
 * to move from, insert_before is the index to insert before (after the
 * removal). Spotify performs both ops atomically.
 */
export async function reorderTrack(
  playlistId: string,
  rangeStart: number,
  insertBefore: number,
): Promise<void> {
  if (rangeStart === insertBefore || rangeStart + 1 === insertBefore) return;
  await spotifyFetch(`/playlists/${playlistId}/items`, {
    method: "PUT",
    body: JSON.stringify({
      range_start: rangeStart,
      insert_before: insertBefore,
      range_length: 1,
    }),
  });
  invalidatePlaylist(playlistId);
}

export async function copyTracksToPlaylist(
  targetPlaylistId: string,
  uris: string[],
) {
  await addTracksToPlaylist(targetPlaylistId, uris);
}

export async function moveTracksToPlaylist(
  fromPlaylistId: string,
  targetPlaylistId: string,
  uris: string[],
) {
  await addTracksToPlaylist(targetPlaylistId, uris);
  await removeTracksFromPlaylist(fromPlaylistId, uris);
}

export type CreatePlaylistInput = {
  name: string;
  description?: string;
  public?: boolean;
  collaborative?: boolean;
  redirectAfter?: boolean;
};

/**
 * Removes all instances of the given URIs from the playlist, then re-adds one
 * of each. Result: exactly one copy of each duplicated track remains.
 * Caveat: re-added tracks go to the end of the playlist (Spotify's API doesn't
 * support positional dedup in the new /items shape).
 */
export async function cleanupDuplicates(
  playlistId: string,
  dupUris: string[],
): Promise<{ removed: number; readded: number }> {
  if (dupUris.length === 0) return { removed: 0, readded: 0 };

  // Remove ALL instances of each duplicate URI.
  for (const chunk of chunked(dupUris)) {
    const urisParam = chunk.join(",");
    await spotifyFetch(
      `/playlists/${playlistId}/items?uris=${urisParam}`,
      { method: "DELETE" },
    );
  }

  // Re-add a single copy of each.
  for (const chunk of chunked(dupUris)) {
    await spotifyFetch(`/playlists/${playlistId}/items`, {
      method: "POST",
      body: JSON.stringify({ uris: chunk }),
    });
  }

  invalidatePlaylist(playlistId);
  return { removed: dupUris.length, readded: dupUris.length };
}

/** Single page of liked songs — used by client-side progressive loaders. */
export async function fetchLikedPage(
  offset: number,
  limit = 50,
): Promise<{
  items: SavedTrackItem[];
  total: number;
  next: string | null;
}> {
  const data = await getLikedSongs(limit, offset);
  return { items: data.items, total: data.total, next: data.next };
}

/** Fetches a single page of playlist items — used for lazy "Cargar más". */
export async function fetchTracksPage(
  playlistId: string,
  offset: number,
): Promise<{ items: PlaylistTrackItem[]; total: number; next: string | null }> {
  const data = await getPlaylistTracks(playlistId, 100, offset);
  return { items: data.items, total: data.total, next: data.next };
}

export async function createPlaylist(
  input: CreatePlaylistInput,
): Promise<SpotifyPlaylist> {
  const name = input.name.trim();
  if (!name) throw new Error("El nombre no puede estar vacío");

  const isCollab = Boolean(input.collaborative);
  const isPublic = isCollab ? false : Boolean(input.public);

  const playlist = await spotifyFetch<SpotifyPlaylist>(`/me/playlists`, {
    method: "POST",
    body: JSON.stringify({
      name,
      description: input.description?.trim() || undefined,
      public: isPublic,
      collaborative: isCollab,
    }),
  });

  revalidateTag("playlists-list");
  if (input.redirectAfter) redirect(`/playlist/${playlist.id}`);
  return playlist;
}

/**
 * Creates a playlist and immediately fills it with the given track URIs.
 * Used when materializing a filtered subset (e.g. all "shoegaze" tracks)
 * into its own Spotify playlist.
 */
export async function createPlaylistFromTracks(
  input: CreatePlaylistInput,
  uris: string[],
): Promise<SpotifyPlaylist> {
  const playlist = await createPlaylist({ ...input, redirectAfter: false });
  if (uris.length > 0) {
    await addTracksToPlaylist(playlist.id, uris);
  }
  if (input.redirectAfter) redirect(`/playlist/${playlist.id}`);
  return playlist;
}

/**
 * Merges several playlists into a single new one. Reads tracks from each
 * source sequentially (to stay polite with Spotify's rate limit), optionally
 * deduplicates, then creates the destination and fills it.
 */
export async function mergePlaylists(
  sourceIds: string[],
  input: CreatePlaylistInput,
  options: { dedupe: boolean } = { dedupe: true },
): Promise<SpotifyPlaylist> {
  if (sourceIds.length === 0) throw new Error("Selecciona playlists");
  if (!input.name?.trim()) throw new Error("Nombre obligatorio");

  // Collect all track URIs in order, tagged by source for dedupe.
  const collected: string[] = [];
  const seen = new Set<string>();

  for (const id of sourceIds) {
    let offset = 0;
    while (true) {
      const page = await getPlaylistTracks(id, 100, offset);
      for (const it of page.items) {
        const uri = (it.item ?? it.track)?.uri;
        if (!uri) continue;
        if (options.dedupe) {
          if (seen.has(uri)) continue;
          seen.add(uri);
        }
        collected.push(uri);
      }
      offset += page.items.length;
      if (offset >= page.total || page.items.length === 0) break;
      // Polite throttle between pages.
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  return createPlaylistFromTracks(input, collected);
}
