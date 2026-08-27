import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/test-db";

function tablas(sqlite: ReturnType<typeof createTestDb>["sqlite"]): string[] {
  const filas = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as { name: string }[];
  return filas.map((f) => f.name);
}

describe("esquema", () => {
  it("crea las tablas nuevas", () => {
    const { sqlite } = createTestDb();
    const nombres = tablas(sqlite);
    expect(nombres).toContain("streams");
    expect(nombres).toContain("spotify_credentials");
    expect(nombres).toContain("capture_state");
    expect(nombres).toContain("import_batches");
    expect(nombres).toContain("artist_resolution");
    expect(nombres).toContain("top_snapshots");
  });

  it("conserva las tablas existentes", () => {
    const { sqlite } = createTestDb();
    const nombres = tablas(sqlite);
    expect(nombres).toContain("artists");
    expect(nombres).toContain("tags");
  });

  // liked_tracks y smart_playlists se retiraron con /smart. La base real las
  // conserva vacias —el DDL solo crea, nunca borra— pero el esquema ya no las
  // declara, asi que nadie deberia volver a escribir en ellas.
  it("ya no declara las tablas de las listas inteligentes", () => {
    const { sqlite } = createTestDb();
    const nombres = tablas(sqlite);
    expect(nombres).not.toContain("liked_tracks");
    expect(nombres).not.toContain("smart_playlists");
  });

  it("rechaza dos streams con el mismo dedup_key", () => {
    const { sqlite } = createTestDb();
    const insertar = sqlite.prepare(`
      INSERT INTO streams
        (ts, ms_played, track_name, artist_name, track_key, artist_key,
         local_date, local_hour, source, dedup_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const fila = [
      1_700_000_000_000, 210_000, "Alison", "Slowdive",
      "slowdivealison", "slowdive", "2023-11-14", 15, "live", "clave-1",
    ];

    insertar.run(...fila);
    expect(() => insertar.run(...fila)).toThrow(/UNIQUE/);
  });

  it("permite varias filas de spotify_credentials solo con id = 1", () => {
    const { sqlite } = createTestDb();
    const insertar = sqlite.prepare(`
      INSERT INTO spotify_credentials (id, spotify_user_id, refresh_token, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    insertar.run(1, "usuario", "token", Date.now());
    expect(() => insertar.run(2, "otro", "token", Date.now())).toThrow(/CHECK/);
  });

  it("rechaza un valor de source fuera de 'live' e 'import'", () => {
    const { sqlite } = createTestDb();
    const insertar = sqlite.prepare(`
      INSERT INTO streams
        (ts, ms_played, track_name, artist_name, track_key, artist_key,
         local_date, local_hour, source, dedup_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const fila = (source: string, dedup: string) => [
      1_700_000_000_000, 210_000, "Alison", "Slowdive",
      "slowdivealison", "slowdive", "2023-11-14", 15, source, dedup,
    ];

    // Los dos valores legítimos entran.
    expect(() => insertar.run(...fila("live", "a"))).not.toThrow();
    expect(() => insertar.run(...fila("import", "b"))).not.toThrow();

    // El borrado de la regla "el dump manda" busca source = 'live' exacto.
    // Una variante de mayúsculas o con espacios rompería la deduplicación en
    // silencio, así que la base tiene que rechazarla.
    expect(() => insertar.run(...fila("Live", "c"))).toThrow(/CHECK/);
    expect(() => insertar.run(...fila("live ", "d"))).toThrow(/CHECK/);
    expect(() => insertar.run(...fila("", "e"))).toThrow(/CHECK/);
  });
});
