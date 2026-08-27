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
    /** Cubre las preguntas de «vida»: primera vez, ultima vez y cuantas van. */
    byArtistDate: index("streams_artist_date_idx").on(
      t.artistKey,
      t.localDate,
      t.msPlayed,
    ),
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
 * Caratula de una cancion o de un album.
 *
 * Ambas salen del mismo sitio --el album de la pista-- asi que comparten tabla
 * y se distinguen por `tipo`. Una `url` a null significa "buscada y no
 * encontrada", para no repetir la consulta en cada pasada.
 */
export const caratula = sqliteTable(
  "caratula",
  {
    tipo: text("tipo").notNull(),
    clave: text("clave").notNull(),
    url: text("url"),
    fetchedAt: integer("fetched_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tipo, t.clave] })],
);

export type CaratulaRow = typeof caratula.$inferSelect;

/**
 * Foto del artista, resuelta por nombre contra el buscador de Spotify.
 *
 * `spotifyId` a null significa "buscado y no encontrado". Se guarda el id
 * ademas de la url porque las urls del CDN caducan: desde el id se vuelve a
 * pedir la foto sin repetir la busqueda por nombre, que es la parte cara y la
 * que puede equivocarse de artista.
 */
export const artistImagen = sqliteTable("artist_imagen", {
  artistKey: text("artist_key").primaryKey(),
  spotifyId: text("spotify_id"),
  url: text("url"),
  fetchedAt: integer("fetched_at").notNull(),
});

export type ArtistImagenRow = typeof artistImagen.$inferSelect;

/**
 * Popularidad del artista segun Last.fm.
 *
 * Sustituye al `popularity` que Spotify retiro de sus objetos de artista.
 * Tabla aparte y no dos columnas mas en `artistGenres`: el esquema se aplica
 * con CREATE TABLE IF NOT EXISTS y no hay ALTER, asi que anadir columnas no
 * llegaria a las bases ya instaladas.
 */
export const artistStats = sqliteTable("artist_stats", {
  artistKey: text("artist_key").primaryKey(),
  listeners: integer("listeners"),
  playcount: integer("playcount"),
  fetchedAt: integer("fetched_at").notNull(),
});

export type ArtistStatsRow = typeof artistStats.$inferSelect;

/**
 * Fragmento de 30 segundos para escuchar una sugerencia sin salir de la app.
 *
 * Spotify retiró `preview_url`, así que sale de iTunes o de Deezer. Se cachea
 * también el fallo, con `url` a null: sin eso, una canción que no está en
 * ninguno de los dos se buscaría en cada pasada, para siempre.
 */
export const preview = sqliteTable("preview", {
  clave: text("clave").primaryKey(),
  url: text("url"),
  /** 'itunes' | 'deezer'. Null cuando no se encontro. */
  fuente: text("fuente"),
  fetchedAt: integer("fetched_at").notNull(),
});

export type PreviewRow = typeof preview.$inferSelect;

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
