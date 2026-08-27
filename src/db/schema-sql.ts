/**
 * DDL del esquema, como constante.
 *
 * Vive aparte de `index.ts` para que los tests puedan construir una base en
 * memoria con el mismo esquema exacto que producción. Duplicarlo garantizaría
 * que los dos diverjan.
 *
 * Idempotente: se ejecuta en cada arranque.
 */
export const SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS artists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      genres TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS artists_updated_at ON artists(updated_at);

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT 'acid',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS track_tags (
      track_uri TEXT NOT NULL,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (track_uri, tag_id)
    );
    CREATE INDEX IF NOT EXISTS track_tags_tag_idx ON track_tags(tag_id);

    CREATE TABLE IF NOT EXISTS streams (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      ts            INTEGER NOT NULL,
      ms_played     INTEGER NOT NULL,
      track_uri     TEXT,
      track_name    TEXT NOT NULL,
      artist_name   TEXT NOT NULL,
      album_name    TEXT,
      track_key     TEXT NOT NULL,
      artist_key    TEXT NOT NULL,
      album_key     TEXT,
      local_date    TEXT NOT NULL,
      local_hour    INTEGER NOT NULL,
      reason_start  TEXT,
      reason_end    TEXT,
      shuffle       INTEGER,
      skipped       INTEGER,
      platform      TEXT,
      source        TEXT NOT NULL CHECK (source IN ('live', 'import')),
      dedup_key     TEXT NOT NULL UNIQUE
    );
    CREATE INDEX IF NOT EXISTS streams_ts_idx         ON streams(ts);
    CREATE INDEX IF NOT EXISTS streams_artist_idx     ON streams(artist_key, ts);
    -- Indice de cobertura para las preguntas de «vida» de un artista: cuando
    -- empezo, cuando fue la ultima vez y cuantas van. Con solo (artist_key, ts)
    -- el agrupado leia local_date de la tabla fila a fila y tardaba 687 ms
    -- sobre el historial entero; cubriendo las tres columnas, 23.
    CREATE INDEX IF NOT EXISTS streams_artist_date_idx ON streams(artist_key, local_date, ms_played);
    CREATE INDEX IF NOT EXISTS streams_track_idx      ON streams(track_key, ts);
    CREATE INDEX IF NOT EXISTS streams_album_idx      ON streams(album_key, ts);
    CREATE INDEX IF NOT EXISTS streams_local_date_idx ON streams(local_date);
    CREATE INDEX IF NOT EXISTS streams_local_hour_idx ON streams(local_hour);
    CREATE INDEX IF NOT EXISTS streams_source_ts_idx  ON streams(source, ts);

    CREATE TABLE IF NOT EXISTS spotify_credentials (
      id               INTEGER PRIMARY KEY CHECK (id = 1),
      spotify_user_id  TEXT NOT NULL,
      refresh_token    TEXT NOT NULL,
      access_token     TEXT,
      expires_at       INTEGER,
      updated_at       INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS capture_state (
      id                INTEGER PRIMARY KEY CHECK (id = 1),
      last_played_at    INTEGER,
      last_run_at       INTEGER,
      last_run_status   TEXT,
      last_run_inserted INTEGER,
      last_error        TEXT,
      gap_suspected_at  INTEGER
    );

    CREATE TABLE IF NOT EXISTS import_batches (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      filename      TEXT NOT NULL,
      file_hash     TEXT,
      format        TEXT,
      rows_read     INTEGER,
      rows_inserted INTEGER,
      rows_skipped  INTEGER,
      rows_invalid  INTEGER,
      range_start   INTEGER,
      range_end     INTEGER,
      imported_at   INTEGER NOT NULL,
      status        TEXT
    );

    CREATE TABLE IF NOT EXISTS top_snapshots (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      taken_at     INTEGER NOT NULL,
      time_range   TEXT NOT NULL,
      entity       TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
  
  CREATE TABLE IF NOT EXISTS artist_genres (
    artist_key TEXT PRIMARY KEY,
    genres     TEXT NOT NULL DEFAULT '[]',
    fetched_at INTEGER NOT NULL
  );

  -- Cache de la busqueda de un tema de Last.fm en el catalogo de Spotify.
  -- Un track_uri a NULL significa "buscado y no encontrado": guardar tambien
  -- los fallos evita repetir la misma busqueda infructuosa en cada visita.
  -- Sin acentos graves aqui dentro: cerrarian la plantilla de cadena.
  -- Popularidad del artista segun Last.fm. Va en tabla aparte y no como dos
  -- columnas mas de artist_genres porque este DDL solo sabe crear tablas que
  -- falten, sin ALTER: anadir columnas a una que ya existe no llegaria a las
  -- bases instaladas, mientras que una tabla nueva si se crea sola. Ademas
  -- caducan distinto: las etiquetas casi no cambian y estas cifras suben cada
  -- dia.
  --
  -- Ojo al redactar aqui: el test de paridad cuenta las apariciones de la
  -- sentencia de creacion en todo el fichero, comentarios incluidos.
  CREATE TABLE IF NOT EXISTS artist_stats (
    artist_key TEXT PRIMARY KEY,
    listeners  INTEGER,
    playcount  INTEGER,
    fetched_at INTEGER NOT NULL
  );

  -- Foto del artista, resuelta por nombre contra el buscador de Spotify.
  -- Un spotify_id a NULL significa "buscado y no encontrado". Se guarda el id
  -- ademas de la url porque las urls del CDN caducan y desde el id se vuelve a
  -- pedir la foto sin repetir la busqueda.
  -- (Sin acentos graves aqui dentro: cerrarian la plantilla de cadena.)
  -- Caratula de una cancion o de un album. Ambas salen del mismo sitio -- el
  -- album de la pista -- asi que comparten tabla y se distinguen por tipo.
  -- Una url a NULL significa "buscada y no encontrada".
  -- (Sin acentos graves aqui dentro: cerrarian la plantilla de cadena.)
  CREATE TABLE IF NOT EXISTS caratula (
    tipo       TEXT NOT NULL,
    clave      TEXT NOT NULL,
    url        TEXT,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (tipo, clave)
  );

  CREATE TABLE IF NOT EXISTS artist_imagen (
    artist_key TEXT PRIMARY KEY,
    spotify_id TEXT,
    url        TEXT,
    fetched_at INTEGER NOT NULL
  );

  -- Lo que ya decidiste en Descubrir, para no volver a proponerlo.
  -- Se guarda tanto lo pasado como lo guardado: en los dos casos ya diste una
  -- respuesta y volver a enseñarlo es hacerte perder el tiempo.
  CREATE TABLE IF NOT EXISTS descubrimiento_visto (
    clave     TEXT PRIMARY KEY,
    decision  TEXT NOT NULL CHECK (decision IN ('pasada', 'guardada')),
    artista   TEXT,
    titulo    TEXT,
    vista_en  INTEGER NOT NULL
  );

  -- Fragmento de 30 s para escuchar una sugerencia sin salir de la app.
  -- Spotify retiro preview_url, asi que sale de iTunes o de Deezer. Se cachea
  -- el fallo tambien, con url NULL: sin eso, una cancion que no esta en
  -- ninguno de los dos se buscaria en cada pasada, para siempre.
  CREATE TABLE IF NOT EXISTS preview (
    clave      TEXT PRIMARY KEY,
    url        TEXT,
    fuente     TEXT,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lastfm_resolucion (
    clave      TEXT PRIMARY KEY,
    track_uri  TEXT,
    fetched_at INTEGER NOT NULL
  );
`;
