"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/db";
import {
  smartPlaylists,
  artists as artistsTable,
  trackTags,
} from "@/db/schema";
import { spotifyFetch } from "./spotify";
import { getCachedLikedTracks } from "./liked-cache";
import { evaluateRules, type SmartRules } from "./smart-rules";

export type SmartPlaylist = {
  id: number;
  name: string;
  description: string | null;
  rules: SmartRules;
  spotifyPlaylistId: string | null;
  lastSyncedAt: number | null;
  lastSyncCount: number | null;
  createdAt: number;
  updatedAt: number;
};

function rowToSmart(row: typeof smartPlaylists.$inferSelect): SmartPlaylist {
  let rules: SmartRules = {};
  try {
    rules = JSON.parse(row.rulesJson || "{}") as SmartRules;
  } catch {
    rules = {};
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    rules,
    spotifyPlaylistId: row.spotifyPlaylistId,
    lastSyncedAt: row.lastSyncedAt,
    lastSyncCount: row.lastSyncCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listSmartPlaylists(): Promise<SmartPlaylist[]> {
  const rows = await db
    .select()
    .from(smartPlaylists)
    .orderBy(smartPlaylists.updatedAt);
  return rows.map(rowToSmart).reverse();
}

export async function getSmartPlaylist(
  id: number,
): Promise<SmartPlaylist | null> {
  const rows = await db
    .select()
    .from(smartPlaylists)
    .where(eq(smartPlaylists.id, id));
  if (rows.length === 0) return null;
  return rowToSmart(rows[0]);
}

export async function createSmartPlaylist(input: {
  name: string;
  description?: string;
  rules: SmartRules;
}): Promise<SmartPlaylist> {
  const name = input.name.trim();
  if (!name) throw new Error("Nombre obligatorio");
  const now = Date.now();
  const result = await db
    .insert(smartPlaylists)
    .values({
      name,
      description: input.description?.trim() || null,
      rulesJson: JSON.stringify(input.rules ?? {}),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  revalidatePath("/smart");
  return rowToSmart(result[0]);
}

export async function updateSmartPlaylist(
  id: number,
  input: {
    name?: string;
    description?: string | null;
    rules?: SmartRules;
  },
): Promise<void> {
  const set: Partial<typeof smartPlaylists.$inferInsert> = {
    updatedAt: Date.now(),
  };
  if (input.name !== undefined) {
    if (!input.name.trim()) throw new Error("Nombre obligatorio");
    set.name = input.name.trim();
  }
  if (input.description !== undefined) {
    set.description = input.description?.trim() || null;
  }
  if (input.rules !== undefined) {
    set.rulesJson = JSON.stringify(input.rules);
  }
  await db.update(smartPlaylists).set(set).where(eq(smartPlaylists.id, id));
  revalidatePath("/smart");
  revalidatePath(`/smart/${id}`);
}

export async function deleteSmartPlaylist(id: number): Promise<void> {
  await db.delete(smartPlaylists).where(eq(smartPlaylists.id, id));
  revalidatePath("/smart");
}

/* ---------------------------------------------------------------- */

/**
 * Materializes a smart playlist:
 *  1. Read source tracks from local cache (Liked Songs).
 *  2. Pull tags + artist genres from local DB.
 *  3. Apply rules.
 *  4. Create or replace the matching Spotify playlist.
 *
 * No Spotify reads other than what's needed to write the result. Rate-limit
 * friendly thanks to the global limiter.
 */
export async function materializeSmartPlaylist(
  id: number,
): Promise<{ count: number; spotifyPlaylistId: string }> {
  const smart = await getSmartPlaylist(id);
  if (!smart) throw new Error("Smart playlist no encontrada");

  // 1. Source tracks
  const { tracks: cachedTracks } = await getCachedLikedTracks();
  if (cachedTracks.length === 0) {
    throw new Error(
      "No hay Liked Songs en cache. Ve a Stats y escanea primero.",
    );
  }

  // 2. Tags map: trackUri -> tagId[]
  const tagsByUri: Record<string, number[]> = {};
  const allUris = cachedTracks.map((t) => t.uri);
  if (allUris.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < allUris.length; i += CHUNK) {
      const slice = allUris.slice(i, i + CHUNK);
      const rows = await db
        .select({
          uri: trackTags.trackUri,
          tagId: trackTags.tagId,
        })
        .from(trackTags)
        .where(inArray(trackTags.trackUri, slice));
      for (const r of rows) {
        if (!tagsByUri[r.uri]) tagsByUri[r.uri] = [];
        tagsByUri[r.uri].push(r.tagId);
      }
    }
  }

  // 3. Genres map: artistId -> genres[]
  const genresByArtistId: Record<string, string[]> = {};
  const artistIds = Array.from(
    new Set(cachedTracks.flatMap((t) => t.artists.map((a) => a.id))),
  ).filter(Boolean);
  if (artistIds.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < artistIds.length; i += CHUNK) {
      const slice = artistIds.slice(i, i + CHUNK);
      const rows = await db
        .select({
          id: artistsTable.id,
          genres: artistsTable.genres,
        })
        .from(artistsTable)
        .where(inArray(artistsTable.id, slice));
      for (const r of rows) {
        try {
          genresByArtistId[r.id] = JSON.parse(r.genres) as string[];
        } catch {
          genresByArtistId[r.id] = [];
        }
      }
    }
  }

  // 4. Apply rules
  const matched = evaluateRules(cachedTracks, smart.rules, {
    tagsByUri,
    genresByArtistId,
  });
  const uris = matched.map((t) => t.uri);

  // 5. Ensure Spotify playlist exists
  let playlistId = smart.spotifyPlaylistId;
  if (!playlistId) {
    type CreateResp = { id: string };
    const created = await spotifyFetch<CreateResp>(`/me/playlists`, {
      method: "POST",
      body: JSON.stringify({
        name: smart.name,
        description:
          smart.description ?? "Smart playlist generada por Ledger.",
        public: false,
        collaborative: false,
      }),
    });
    playlistId = created.id;
  }

  // 6. Replace contents.
  if (uris.length === 0) {
    // Empty replace via PUT with empty array.
    await spotifyFetch(`/playlists/${playlistId}/items`, {
      method: "PUT",
      body: JSON.stringify({ uris: [] }),
    });
  } else {
    const CHUNK = 100;
    // First chunk uses PUT (replaces whole playlist).
    const firstChunk = uris.slice(0, CHUNK);
    await spotifyFetch(`/playlists/${playlistId}/items`, {
      method: "PUT",
      body: JSON.stringify({ uris: firstChunk }),
    });
    // Remaining chunks appended via POST.
    for (let i = CHUNK; i < uris.length; i += CHUNK) {
      const slice = uris.slice(i, i + CHUNK);
      await spotifyFetch(`/playlists/${playlistId}/items`, {
        method: "POST",
        body: JSON.stringify({ uris: slice }),
      });
    }
  }

  // 7. Persist sync state
  await db
    .update(smartPlaylists)
    .set({
      spotifyPlaylistId: playlistId,
      lastSyncedAt: Date.now(),
      lastSyncCount: uris.length,
      updatedAt: Date.now(),
    })
    .where(eq(smartPlaylists.id, id));

  revalidatePath("/smart");
  revalidatePath(`/smart/${id}`);
  revalidateTag(`playlist-${playlistId}`);
  revalidateTag(`playlist-${playlistId}-items`);
  revalidateTag("playlists-list");

  return { count: uris.length, spotifyPlaylistId: playlistId };
}
