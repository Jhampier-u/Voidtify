import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";

export const artists = sqliteTable("artists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** JSON-encoded array of genre strings, e.g. ["indie pop", "shoegaze"]. */
  genres: text("genres").notNull().default("[]"),
  updatedAt: integer("updated_at").notNull(),
});

export type ArtistRow = typeof artists.$inferSelect;

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("acid"),
  createdAt: integer("created_at").notNull(),
});

export type TagRow = typeof tags.$inferSelect;

export const trackTags = sqliteTable(
  "track_tags",
  {
    trackUri: text("track_uri").notNull(),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    addedAt: integer("added_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.trackUri, t.tagId] }),
    byTag: index("track_tags_tag_idx").on(t.tagId),
  }),
);

/** Cached scan of the user's Liked Songs — avoids re-fetching from Spotify. */
export const likedTracks = sqliteTable("liked_tracks", {
  uri: text("uri").primaryKey(),
  name: text("name").notNull(),
  /** JSON: [{id, name}]. */
  artistsJson: text("artists_json").notNull(),
  albumId: text("album_id"),
  albumName: text("album_name"),
  albumImage: text("album_image"),
  durationMs: integer("duration_ms").notNull().default(0),
  explicit: integer("explicit").notNull().default(0),
  addedAt: text("added_at"),
  scannedAt: integer("scanned_at").notNull(),
});

export type LikedTrackRow = typeof likedTracks.$inferSelect;

/** User-defined dynamic playlists with rules. */
export const smartPlaylists = sqliteTable("smart_playlists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  /** JSON-encoded rules — see SmartRules type. */
  rulesJson: text("rules_json").notNull().default("{}"),
  /** Set after first materialize. */
  spotifyPlaylistId: text("spotify_playlist_id"),
  lastSyncedAt: integer("last_synced_at"),
  lastSyncCount: integer("last_sync_count"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type SmartPlaylistRow = typeof smartPlaylists.$inferSelect;
