import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "./helpers/test-db";
import { seedStreams, stream } from "./helpers/seed-streams";
import {
  getPendientes,
  mejorCaratula,
  rellenarCaratulasEnLote,
  MAX_EDAD_MS,
  type PistaSpotify,
} from "@/lib/capture/rellenar-caratulas";
import { caratula } from "@/db/schema";
import { albumKey, trackKey } from "@/lib/stats/normalize";
import type { Db } from "@/lib/stats/shared";

const AHORA = 1_800_000_000_000;
const DIA = 86_400_000;

const pista = (uri: string, anchos: number[] = [640, 300, 64]): PistaSpotify => ({
  uri,
  album: { images: anchos.map((w) => ({ url: `u${w}`, width: w })) },
});

describe("mejorCaratula", () => {
  it("prefiere la más cercana a 300 px", () => {
    expect(mejorCaratula(pista("x"))).toBe("u300");
  });

  it("se queda con la que haya", () => {
    expect(mejorCaratula(pista("x", [640]))).toBe("u640");
  });

  it("devuelve null si el álbum no trae imágenes", () => {
    expect(mejorCaratula({ uri: "x", album: { images: [] } })).toBeNull();
    expect(mejorCaratula({ uri: "x" })).toBeNull();
  });
});

describe("getPendientes", () => {
  let db: Db;
  let sqlite: ReturnType<typeof createTestDb>["sqlite"];

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    sqlite = t.sqlite;
  });

  const cachear = (tipo: string, clave: string, cuando: number) =>
    sqlite
      .prepare(
        "INSERT INTO caratula (tipo, clave, url, fetched_at) VALUES (?, ?, ?, ?)",
      )
      .run(tipo, clave, "u", cuando);

  it("devuelve las canciones sin carátula, con una uri", () => {
    seedStreams(sqlite, [
      stream({ trackName: "Alison", trackUri: "spotify:track:abc" }),
    ]);
    expect(getPendientes(db, "cancion", 10, AHORA)).toEqual([
      { clave: trackKey("Slowdive", "Alison"), uri: "spotify:track:abc" },
    ]);
  });

  // La carátula de un álbum sale de cualquiera de sus pistas, así que basta con
  // una: por eso los dos tipos se resuelven por el mismo camino.
  it("agrupa el álbum en una sola entrada aunque tenga varias pistas", () => {
    seedStreams(sqlite, [
      stream({ trackName: "Alison", albumName: "Souvlaki" }),
      stream({ trackName: "Dagger", albumName: "Souvlaki" }),
    ]);
    const p = getPendientes(db, "album", 10, AHORA);
    expect(p).toHaveLength(1);
    expect(p[0].clave).toBe(albumKey("Slowdive", "Souvlaki"));
  });

  it("omite las ya cacheadas y recientes", () => {
    seedStreams(sqlite, [stream({ trackName: "Alison" })]);
    cachear("cancion", trackKey("Slowdive", "Alison"), AHORA - DIA);
    expect(getPendientes(db, "cancion", 10, AHORA)).toEqual([]);
  });

  it("las recupera cuando caducan", () => {
    seedStreams(sqlite, [stream({ trackName: "Alison" })]);
    cachear("cancion", trackKey("Slowdive", "Alison"), AHORA - MAX_EDAD_MS - DIA);
    expect(getPendientes(db, "cancion", 10, AHORA)).toHaveLength(1);
  });

  // Una cancion cacheada no debe tapar a su album, que es otro tipo.
  it("no confunde los dos tipos", () => {
    seedStreams(sqlite, [stream({ trackName: "Alison", albumName: "Souvlaki" })]);
    cachear("cancion", trackKey("Slowdive", "Alison"), AHORA - DIA);
    expect(getPendientes(db, "cancion", 10, AHORA)).toEqual([]);
    expect(getPendientes(db, "album", 10, AHORA)).toHaveLength(1);
  });

  it("ignora las filas sin uri, que no se pueden resolver", () => {
    seedStreams(sqlite, [stream({ trackName: "Alison", trackUri: null })]);
    expect(getPendientes(db, "cancion", 10, AHORA)).toEqual([]);
  });

  it("antepone lo que suena ahora", () => {
    const hoy = new Date(AHORA).toISOString().slice(0, 10);
    const viejo = new Date(AHORA - 400 * DIA).toISOString().slice(0, 10);
    seedStreams(sqlite, [
      ...Array.from({ length: 10 }, () =>
        stream({ trackName: "Antigua", localDate: viejo }),
      ),
      stream({ trackName: "Actual", localDate: hoy }),
    ]);
    expect(getPendientes(db, "cancion", 10, AHORA)[0].clave).toBe(
      trackKey("Slowdive", "Actual"),
    );
  });
});

describe("rellenarCaratulasEnLote", () => {
  let db: Db;
  let sqlite: ReturnType<typeof createTestDb>["sqlite"];

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    sqlite = t.sqlite;
  });

  it("pide una por una y guarda todas", async () => {
    seedStreams(
      sqlite,
      Array.from({ length: 12 }, (_, i) =>
        stream({ trackName: `T${i}`, trackUri: `spotify:track:t${i}` }),
      ),
    );
    const pedir = vi.fn(async (id: string) => pista(`spotify:track:${id}`));

    const r = await rellenarCaratulasEnLote(db, "cancion", pedir, 50, AHORA);
    expect(pedir).toHaveBeenCalledTimes(12);
    expect(r.conCaratula).toBe(12);
  });

  // Una pista retirada del catalogo devuelve null. Debe anotarse el hueco, no
  // dejarse sin fila.
  it("anota el hueco cuando la pista ya no existe", async () => {
    seedStreams(sqlite, [stream({ trackName: "Retirada" })]);
    const pedir = vi.fn().mockResolvedValue(null);

    await rellenarCaratulasEnLote(db, "cancion", pedir, 50, AHORA);
    const filas = await db.select().from(caratula);
    expect(filas).toHaveLength(1);
    expect(filas[0].url).toBeNull();
  });

  // La version anterior hacia `continue` en silencio, y cuando el endpoint en
  // lote empezo a devolver 403 la funcion parecia no hacer nada sin dar una
  // sola pista de por que. Los fallos se cuentan.
  it("cuenta los fallos en vez de tragarselos", async () => {
    seedStreams(sqlite, [
      stream({ trackName: "A" }),
      stream({ trackName: "B" }),
    ]);
    const pedir = vi.fn().mockRejectedValue(new Error("403"));

    const r = await rellenarCaratulasEnLote(db, "cancion", pedir, 50, AHORA);
    expect(r).toMatchObject({ pedidos: 2, conCaratula: 0, fallos: 2 });
  });

  it("no anota nada si falla la red", async () => {
    seedStreams(sqlite, [stream({ trackName: "Alison" })]);
    const pedir = vi.fn().mockRejectedValue(new Error("sin conexión"));

    await rellenarCaratulasEnLote(db, "cancion", pedir, 50, AHORA);
    expect(await db.select().from(caratula)).toHaveLength(0);
  });

  it("no llama a Spotify si no hay nada pendiente", async () => {
    const pedir = vi.fn();
    const r = await rellenarCaratulasEnLote(db, "cancion", pedir, 50, AHORA);
    expect(pedir).not.toHaveBeenCalled();
    expect(r).toEqual({ pedidos: 0, conCaratula: 0, fallos: 0 });
  });
});
