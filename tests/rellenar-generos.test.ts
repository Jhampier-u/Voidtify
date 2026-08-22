import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./helpers/test-db";
import { seedStreams, stream } from "./helpers/seed-streams";
import {
  getArtistasParaRefrescar,
  guardarStats,
  MAX_EDAD_MS,
} from "@/lib/capture/rellenar-generos";
import { artistStats } from "@/db/schema";
import { artistKey } from "@/lib/stats/normalize";
import type { Db } from "@/lib/stats/shared";

const AHORA = 1_800_000_000_000;
const DIA = 86_400_000;

describe("getArtistasParaRefrescar", () => {
  let db: Db;
  let sqlite: ReturnType<typeof createTestDb>["sqlite"];

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    sqlite = t.sqlite;
  });

  const cachear = (nombre: string, cuando: number) =>
    sqlite
      .prepare(
        "INSERT INTO artist_genres (artist_key, genres, fetched_at) VALUES (?, ?, ?)",
      )
      .run(artistKey(nombre), '["shoegaze"]', cuando);

  it("no devuelve nada si no hay escuchas", () => {
    expect(getArtistasParaRefrescar(db, 10, AHORA)).toEqual([]);
  });

  it("devuelve los que nunca se han consultado", () => {
    seedStreams(sqlite, [stream({ artistName: "Slowdive" })]);
    expect(getArtistasParaRefrescar(db, 10, AHORA).map((a) => a.name)).toEqual([
      "Slowdive",
    ]);
  });

  it("omite los que ya están frescos", () => {
    seedStreams(sqlite, [stream({ artistName: "Slowdive" })]);
    cachear("Slowdive", AHORA - DIA);
    expect(getArtistasParaRefrescar(db, 10, AHORA)).toEqual([]);
  });

  // Las etiquetas de Last.fm cambian despacio, pero cambian: sin caducidad, un
  // artista consultado el primer día no volvería a mirarse nunca.
  it("vuelve a incluirlos cuando la caché caduca", () => {
    seedStreams(sqlite, [stream({ artistName: "Slowdive" })]);
    cachear("Slowdive", AHORA - MAX_EDAD_MS - DIA);
    expect(getArtistasParaRefrescar(db, 10, AHORA).map((a) => a.name)).toEqual([
      "Slowdive",
    ]);
  });

  // El reparto de géneros lo dominan los que más suenan: resolverlos antes hace
  // la pantalla útil desde el primer día en vez de al terminar del todo.
  it("pone delante a los más escuchados", () => {
    seedStreams(sqlite, [
      stream({ artistName: "Poco" }),
      stream({ artistName: "Mucho" }),
      stream({ artistName: "Mucho" }),
      stream({ artistName: "Mucho" }),
      stream({ artistName: "Medio" }),
      stream({ artistName: "Medio" }),
    ]);
    expect(getArtistasParaRefrescar(db, 10, AHORA).map((a) => a.name)).toEqual([
      "Mucho",
      "Medio",
      "Poco",
    ]);
  });

  it("respeta el límite del lote", () => {
    seedStreams(
      sqlite,
      Array.from({ length: 30 }, (_, i) => stream({ artistName: `A${i}` })),
    );
    expect(getArtistasParaRefrescar(db, 5, AHORA)).toHaveLength(5);
  });

  // Una reproducción de tres segundos no dice nada del gusto de nadie, y
  // contarla haría gastar peticiones en artistas que apenas se han oído.
  it("ignora las reproducciones que no llegan al umbral", () => {
    seedStreams(sqlite, [
      stream({ artistName: "Saltada", msPlayed: 5_000 }),
      stream({ artistName: "Escuchada", msPlayed: 210_000 }),
    ]);
    expect(getArtistasParaRefrescar(db, 10, AHORA).map((a) => a.name)).toEqual([
      "Escuchada",
    ]);
  });

  it("no repite un artista aunque tenga muchas escuchas", () => {
    seedStreams(
      sqlite,
      Array.from({ length: 12 }, () => stream({ artistName: "Slowdive" })),
    );
    expect(getArtistasParaRefrescar(db, 10, AHORA)).toHaveLength(1);
  });
});

describe("guardarStats", () => {
  let db: Db;

  beforeEach(() => {
    db = createTestDb().db;
  });

  it("guarda oyentes y reproducciones", async () => {
    await guardarStats(db, "slowdive", 2_331_147, 154_731_783, AHORA);
    const filas = await db.select().from(artistStats);
    expect(filas[0]).toMatchObject({
      artistKey: "slowdive",
      listeners: 2_331_147,
      playcount: 154_731_783,
    });
  });

  it("sobrescribe al volver a consultar", async () => {
    await guardarStats(db, "slowdive", 100, 200, AHORA - DIA);
    await guardarStats(db, "slowdive", 150, 300, AHORA);

    const filas = await db.select().from(artistStats);
    expect(filas).toHaveLength(1);
    expect(filas[0].listeners).toBe(150);
    expect(filas[0].fetchedAt).toBe(AHORA);
  });

  // Last.fm no siempre trae las cifras. Guardar null es correcto; convertirlas
  // en 0 diría que nadie lo escucha, que es una afirmación distinta.
  it("acepta que no vengan las cifras", async () => {
    await guardarStats(db, "raro", null, null, AHORA);
    const filas = await db.select().from(artistStats);
    expect(filas[0].listeners).toBeNull();
    expect(filas[0].playcount).toBeNull();
  });
});
