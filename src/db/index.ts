import "server-only";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "ledger.db");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

// Auto-create tables on first run. Idempotent.
sqlite.exec(`
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

  CREATE TABLE IF NOT EXISTS liked_tracks (
    uri TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    artists_json TEXT NOT NULL,
    album_id TEXT,
    album_name TEXT,
    album_image TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    explicit INTEGER NOT NULL DEFAULT 0,
    added_at TEXT,
    scanned_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS liked_tracks_added_at_idx ON liked_tracks(added_at);

  CREATE TABLE IF NOT EXISTS smart_playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    rules_json TEXT NOT NULL DEFAULT '{}',
    spotify_playlist_id TEXT,
    last_synced_at INTEGER,
    last_sync_count INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
