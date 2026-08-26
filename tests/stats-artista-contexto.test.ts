import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./helpers/test-db";
import {
  frasePercentil,
  getContextoArtista,
} from "@/lib/stats/artista-contexto";
import type { Db } from "@/lib/stats/shared";

describe("frasePercentil", () => {
  // Se cuenta desde el lado informativo: decir siempre «mas conocido que el
  // 4 %» obligaria a darle la vuelta mentalmente.
  it("habla de nicho cuando el artista es pequeño", () => {
    expect(frasePercentil(0.04)).toBe("más de nicho que el 96 % de lo que escuchas");
    expect(frasePercentil(0.3)).toBe("más de nicho que el 70 % de lo que escuchas");
  });

  it("habla de conocido cuando el artista es grande", () => {
    expect(frasePercentil(0.9)).toBe("más conocido que el 90 % de lo que escuchas");
    expect(frasePercentil(0.5)).toBe("más conocido que el 50 % de lo que escuchas");
  });

  it("aguanta los extremos", () => {
    expect(frasePercentil(0)).toContain("100 %");
    expect(frasePercentil(1)).toContain("100 %");
  });
});

describe("getContextoArtista", () => {
  let db: Db;
  let sqlite: ReturnType<typeof createTestDb>["sqlite"];

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    sqlite = t.sqlite;
  });

  const generos = (clave: string, lista: string[]) =>
    sqlite
      .prepare(
        "INSERT INTO artist_genres (artist_key, genres, fetched_at) VALUES (?, ?, 0)",
      )
      .run(clave, JSON.stringify(lista));

  const stats = (clave: string, listeners: number | null) =>
    sqlite
      .prepare(
        "INSERT INTO artist_stats (artist_key, listeners, playcount, fetched_at) VALUES (?, ?, ?, 0)",
      )
      .run(clave, listeners, listeners === null ? null : listeners * 10);

  /** Rellena la muestra para que el percentil sea significativo. */
  const poblar = (n: number) => {
    for (let i = 0; i < n; i++) stats(`relleno${i}`, (i + 1) * 1000);
  };

  it("devuelve vacío para un artista que no está en la caché", async () => {
    const c = await getContextoArtista(db, "desconocido");
    expect(c.generos).toEqual([]);
    expect(c.listeners).toBeNull();
    expect(c.percentil).toBeNull();
  });

  it("devuelve los géneros guardados", async () => {
    generos("slowdive", ["shoegaze", "dream pop"]);
    expect((await getContextoArtista(db, "slowdive")).generos).toEqual([
      "shoegaze",
      "dream pop",
    ]);
  });

  // Un JSON corrupto en la cache no debe tumbar la ficha entera.
  it("aguanta unos géneros ilegibles", async () => {
    sqlite
      .prepare(
        "INSERT INTO artist_genres (artist_key, genres, fetched_at) VALUES (?, ?, 0)",
      )
      .run("roto", "{esto no es json");
    expect((await getContextoArtista(db, "roto")).generos).toEqual([]);
  });

  it("devuelve oyentes y reproducciones", async () => {
    stats("slowdive", 2_331_147);
    const c = await getContextoArtista(db, "slowdive");
    expect(c.listeners).toBe(2_331_147);
    expect(c.playcount).toBe(23_311_470);
  });

  describe("el percentil", () => {
    it("mide cuántos de tus artistas tienen menos oyentes", async () => {
      poblar(100); // 1000, 2000 … 100000
      stats("medio", 50_500); // por encima de cincuenta de ellos
      const c = await getContextoArtista(db, "medio");
      expect(c.percentil).toBeCloseTo(50 / 101, 2);
    });

    it("es alto para el artista más grande", async () => {
      poblar(100);
      stats("enorme", 999_999);
      expect((await getContextoArtista(db, "enorme")).percentil).toBeGreaterThan(
        0.98,
      );
    });

    // Con veinte artistas medidos, «mas de nicho que el 90 %» habla de
    // dieciocho nombres: una cifra con pinta de estadistica que no lo es.
    it("se calla sin muestra suficiente", async () => {
      poblar(10);
      stats("solo", 5_000);
      const c = await getContextoArtista(db, "solo");
      expect(c.percentil).toBeNull();
      expect(c.muestra).toBe(11);
    });

    it("se calla si el artista no tiene oyentes guardados", async () => {
      poblar(100);
      stats("sin_cifras", null);
      expect((await getContextoArtista(db, "sin_cifras")).percentil).toBeNull();
    });
  });
});
