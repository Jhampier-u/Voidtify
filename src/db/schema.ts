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

/** Fuente única de escuchas. Alimentada por la captura vía API y por el dump. */
export const streams = sqliteTable(
  "streams",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Epoch ms UTC — fin de la reproducción. */
    ts: integer("ts").notNull(),
    msPlayed: integer("ms_played").notNull(),
    /** NULL en pistas locales y en el dump básico. */
    trackUri: text("track_uri"),
    trackName: text("track_name").notNull(),
    artistName: text("artist_name").notNull(),
    albumName: text("album_name"),
    trackKey: text("track_key").notNull(),
    artistKey: text("artist_key").notNull(),
    albumKey: text("album_key"),
    /** 'YYYY-MM-DD' en STATS_TZ. */
    localDate: text("local_date").notNull(),
    /** 0-23 en STATS_TZ. */
    localHour: integer("local_hour").notNull(),
    /** NULL en filas `live`. */
    reasonStart: text("reason_start"),
    /** NULL en filas `live`. */
    reasonEnd: text("reason_end"),
    /** NULL en filas `live`: recently-played no informa de esto. */
    shuffle: integer("shuffle", { mode: "boolean" }),
    /** NULL en filas `live`. Las estadísticas de skips solo usan `import`. */
    skipped: integer("skipped", { mode: "boolean" }),
    platform: text("platform"),
    /** 'live' | 'import'. Restringido por CHECK en el DDL: el borrado de D2
     *  depende de que el valor sea exactamente 'live'. */
    source: text("source").notNull(),
    dedupKey: text("dedup_key").notNull().unique(),
  },
  (t) => ({
    byTs: index("streams_ts_idx").on(t.ts),
    byArtist: index("streams_artist_idx").on(t.artistKey, t.ts),
    byTrack: index("streams_track_idx").on(t.trackKey, t.ts),
    byAlbum: index("streams_album_idx").on(t.albumKey, t.ts),
    byLocalDate: index("streams_local_date_idx").on(t.localDate),
    byLocalHour: index("streams_local_hour_idx").on(t.localHour),
    bySourceTs: index("streams_source_ts_idx").on(t.source, t.ts),
  }),
);

export type StreamRow = typeof streams.$inferSelect;
export type NewStreamRow = typeof streams.$inferInsert;

/** Fila única (id = 1) con el refresh token, para que el cron funcione sin sesión. */
export const spotifyCredentials = sqliteTable("spotify_credentials", {
  id: integer("id").primaryKey(),
  spotifyUserId: text("spotify_user_id").notNull(),
  refreshToken: text("refresh_token").notNull(),
  accessToken: text("access_token"),
  expiresAt: integer("expires_at"),
  updatedAt: integer("updated_at").notNull(),
});

export type SpotifyCredentialsRow = typeof spotifyCredentials.$inferSelect;

/** Fila única (id = 1) con el cursor y la salud de la captura. */
export const captureState = sqliteTable("capture_state", {
  id: integer("id").primaryKey(),
  lastPlayedAt: integer("last_played_at"),
  lastRunAt: integer("last_run_at"),
  /** 'ok' | 'error' | 'gap'. */
  lastRunStatus: text("last_run_status"),
  lastRunInserted: integer("last_run_inserted"),
  lastError: text("last_error"),
  gapSuspectedAt: integer("gap_suspected_at"),
});

export type CaptureStateRow = typeof captureState.$inferSelect;

/** Un registro por archivo del dump importado. */
export const importBatches = sqliteTable("import_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  fileHash: text("file_hash"),
  /** 'extended' | 'basic'. */
  format: text("format"),
  rowsRead: integer("rows_read"),
  rowsInserted: integer("rows_inserted"),
  rowsSkipped: integer("rows_skipped"),
  rowsInvalid: integer("rows_invalid"),
  rangeStart: integer("range_start"),
  rangeEnd: integer("range_end"),
  importedAt: integer("imported_at").notNull(),
  status: text("status"),
});

export type ImportBatchRow = typeof importBatches.$inferSelect;

/** Puente entre los nombres del dump y los IDs de artista de Spotify. */
export const artistResolution = sqliteTable("artist_resolution", {
  artistKey: text("artist_key").primaryKey(),
  spotifyArtistId: text("spotify_artist_id"),
  imageUrl: text("image_url"),
  resolvedAt: integer("resolved_at"),
  attempts: integer("attempts").notNull().default(0),
});

export type ArtistResolutionRow = typeof artistResolution.$inferSelect;

/** Foto periódica de los tops precalculados por Spotify. No son escuchas. */
export const topSnapshots = sqliteTable("top_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  takenAt: integer("taken_at").notNull(),
  /** 'short_term' | 'medium_term' | 'long_term'. */
  timeRange: text("time_range").notNull(),
  /** 'artists' | 'tracks'. */
  entity: text("entity").notNull(),
  payloadJson: text("payload_json").notNull(),
});

export type TopSnapshotRow = typeof topSnapshots.$inferSelect;

/**
 * Géneros por artista, indexados por la clave normalizada del nombre.
 *
 * No usa el ID de Spotify: Last.fm resuelve por nombre, así que el puente a
 * IDs que el diseño original preveía resultó innecesario. La tabla `artists`
 * sigue existiendo para el lado de la biblioteca, que sí trabaja con IDs.
 */
export const artistGenres = sqliteTable("artist_genres", {
  artistKey: text("artist_key").primaryKey(),
  /** JSON con un array de cadenas. */
  genres: text("genres").notNull().default("[]"),
  fetchedAt: integer("fetched_at").notNull(),
});

/**
 * Cache de la busqueda de un tema de Last.fm en el catalogo de Spotify.
 *
 * `trackUri` a null significa "buscado y no encontrado". Guardar tambien los
 * fallos es deliberado: sin eso, cada visita repetiria la misma busqueda
 * infructuosa contra Spotify.
 */
export const lastfmResolucion = sqliteTable("lastfm_resolucion", {
  clave: text("clave").primaryKey(),
  trackUri: text("track_uri"),
  fetchedAt: integer("fetched_at").notNull(),
});

export type LastfmResolucionRow = typeof lastfmResolucion.$inferSelect;

export type ArtistGenresRow = typeof artistGenres.$inferSelect;
