"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { tags as tagsTable, trackTags } from "@/db/schema";
import { isValidTagColor, type Tag } from "./tags";

/** Returns all tags with their track counts, ordered by most used first. */
export async function listTags(): Promise<Tag[]> {
  const rows = await db
    .select({
      id: tagsTable.id,
      name: tagsTable.name,
      color: tagsTable.color,
      trackCount: sql<number>`coalesce(count(${trackTags.tagId}), 0)`,
    })
    .from(tagsTable)
    .leftJoin(trackTags, eq(tagsTable.id, trackTags.tagId))
    .groupBy(tagsTable.id)
    .orderBy(sql`count(${trackTags.tagId}) desc`, tagsTable.name);
  return rows;
}

export async function createTag(name: string, color = "acid"): Promise<Tag> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("El nombre no puede estar vacío");
  if (trimmed.length > 40) throw new Error("Máximo 40 caracteres");
  const c = isValidTagColor(color) ? color : "acid";

  const existing = await db
    .select()
    .from(tagsTable)
    .where(eq(tagsTable.name, trimmed));
  if (existing.length > 0) {
    throw new Error("Ya existe un tag con ese nombre");
  }

  const result = await db
    .insert(tagsTable)
    .values({
      name: trimmed,
      color: c,
      createdAt: Date.now(),
    })
    .returning();
  return { ...result[0], trackCount: 0 };
}

export async function renameTag(id: number, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("El nombre no puede estar vacío");
  await db
    .update(tagsTable)
    .set({ name: trimmed })
    .where(eq(tagsTable.id, id));
}

export async function setTagColor(id: number, color: string): Promise<void> {
  if (!isValidTagColor(color)) throw new Error("Color inválido");
  await db.update(tagsTable).set({ color }).where(eq(tagsTable.id, id));
}

export async function deleteTag(id: number): Promise<void> {
  // ON DELETE CASCADE handles track_tags, but be explicit just in case.
  await db.delete(trackTags).where(eq(trackTags.tagId, id));
  await db.delete(tagsTable).where(eq(tagsTable.id, id));
}

/** Returns a map of trackUri -> tags applied to it. */
export async function getTagsForTracks(
  uris: string[],
): Promise<Record<string, Tag[]>> {
  const out: Record<string, Tag[]> = {};
  if (uris.length === 0) return out;

  const rows = await db
    .select({
      uri: trackTags.trackUri,
      id: tagsTable.id,
      name: tagsTable.name,
      color: tagsTable.color,
    })
    .from(trackTags)
    .innerJoin(tagsTable, eq(trackTags.tagId, tagsTable.id))
    .where(inArray(trackTags.trackUri, uris));

  for (const r of rows) {
    if (!out[r.uri]) out[r.uri] = [];
    out[r.uri].push({
      id: r.id,
      name: r.name,
      color: r.color,
      trackCount: 0,
    });
  }
  return out;
}

export async function applyTagToTracks(
  tagId: number,
  uris: string[],
): Promise<{ added: number }> {
  if (uris.length === 0) return { added: 0 };
  const now = Date.now();
  const values = uris.map((uri) => ({
    trackUri: uri,
    tagId,
    addedAt: now,
  }));
  // Insert in chunks to avoid overly large statements.
  const CHUNK = 200;
  let added = 0;
  for (let i = 0; i < values.length; i += CHUNK) {
    const slice = values.slice(i, i + CHUNK);
    const result = await db
      .insert(trackTags)
      .values(slice)
      .onConflictDoNothing()
      .returning();
    added += result.length;
  }
  return { added };
}

export async function removeTagFromTracks(
  tagId: number,
  uris: string[],
): Promise<void> {
  if (uris.length === 0) return;
  await db
    .delete(trackTags)
    .where(
      and(
        eq(trackTags.tagId, tagId),
        inArray(trackTags.trackUri, uris),
      ),
    );
}

/** Sets the exact tag set for a single track (toggle UX). */
export async function setTagsForTrack(
  uri: string,
  tagIds: number[],
): Promise<void> {
  await db.delete(trackTags).where(eq(trackTags.trackUri, uri));
  if (tagIds.length === 0) return;
  const now = Date.now();
  await db.insert(trackTags).values(
    tagIds.map((tagId) => ({ trackUri: uri, tagId, addedAt: now })),
  );
}
