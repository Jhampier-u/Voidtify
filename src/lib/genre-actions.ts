"use server";

import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { artists as artistsTable } from "@/db/schema";
import { getArtistById } from "./spotify";
import { getArtistTagsByName } from "./lastfm";

const STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// 6 workers ≈ 30 req/s sustained — well under Spotify's 180/30s window.
const PARALLELISM = 6;

export type ArtistInput = { id: string; name: string };

/**
 * Hybrid genre lookup:
 *  1. Local SQLite cache (30-day TTL).
 *  2. Spotify single-artist endpoint (official Spotify genres).
 *  3. Last.fm fallback if Spotify returns 0 genres.
 *
 * All results are persisted in the artists table keyed by Spotify artist ID.
 */
export async function getArtistGenres(
  inputs: ArtistInput[],
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  if (inputs.length === 0) return out;

  // Dedup by id, prefer first-seen name.
  const byId = new Map<string, ArtistInput>();
  for (const a of inputs) if (!byId.has(a.id)) byId.set(a.id, a);
  const unique = Array.from(byId.values());
  const ids = unique.map((a) => a.id);

  // 1. Read existing cache
  const cached =
    ids.length > 0
      ? await db
          .select()
          .from(artistsTable)
          .where(inArray(artistsTable.id, ids))
      : [];

  const now = Date.now();
  const fresh = new Map<string, string[]>();
  for (const row of cached) {
    const genres = JSON.parse(row.genres) as string[];
    // Treat empty cached entries as stale — likely poisoned by an earlier
    // failed run where Spotify or Last.fm returned nothing. Re-attempt.
    if (now - row.updatedAt < STALE_MS && genres.length > 0) {
      fresh.set(row.id, genres);
    }
  }

  const toFetch = unique.filter((a) => !fresh.has(a.id));
  console.log(
    `[genres] ${unique.length} artists: ${fresh.size} cached, ${toFetch.length} to fetch`,
  );

  if (toFetch.length > 0) {
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(PARALLELISM, toFetch.length) },
      async () => {
        while (cursor < toFetch.length) {
          const idx = cursor++;
          const artist = toFetch[idx];
          if (!artist) break;

          // Spotify deprecated `genres` on /artists/{id} responses in
          // Feb 2026 — they return [] for almost everything. Last.fm is
          // now the primary source.
          let genres = await getArtistTagsByName(artist.name);

          // If Last.fm has nothing, try Spotify as a long-shot — for some
          // very popular artists it may still return data.
          if (genres.length === 0) {
            const spotifyArtist = await getArtistById(artist.id);
            if (spotifyArtist) {
              genres = (spotifyArtist.genres ?? []).map((g) =>
                g.toLowerCase().trim(),
              );
            }
          }
          const canonicalName = artist.name;

          // Persist
          try {
            await db
              .insert(artistsTable)
              .values({
                id: artist.id,
                name: canonicalName,
                genres: JSON.stringify(genres),
                updatedAt: now,
              })
              .onConflictDoUpdate({
                target: artistsTable.id,
                set: {
                  name: canonicalName,
                  genres: JSON.stringify(genres),
                  updatedAt: now,
                },
              });
          } catch (e) {
            console.warn(`[genres] db upsert failed for ${artist.id}:`, e);
          }
          fresh.set(artist.id, genres);
        }
      },
    );
    await Promise.all(workers);
  }

  for (const a of unique) {
    out[a.id] = fresh.get(a.id) ?? [];
  }
  return out;
}
