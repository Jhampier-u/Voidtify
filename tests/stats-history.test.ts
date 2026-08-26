import { describe, expect, it } from "vitest";
import { getHistory, terminosDeBusqueda } from "@/lib/stats/history";
import type { StatsRange } from "@/lib/stats/range";
import { createTestDb } from "./helpers/test-db";
import { seedStreams, stream } from "./helpers/seed-streams";

const HISTORICO: StatsRange = {
  fromDate: "1970-01-01",
  toDate: "2099-12-31",
  label: "Histórico",
  preset: "all",
};

describe("getHistory", () => {
  it("devuelve vacío sin datos", async () => {
    const { db } = createTestDb();
    expect(await getHistory(db, HISTORICO)).toEqual({ rows: [], total: 0 });
  });

  it("ordena de más reciente a más antiguo", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      stream({ ts: 1000, trackName: "Vieja" }),
      stream({ ts: 3000, trackName: "Nueva" }),
      stream({ ts: 2000, trackName: "Media" }),
    ]);

    const h = await getHistory(db, HISTORICO);
    expect(h.rows.map((r) => r.trackName)).toEqual([
      "Nueva",
      "Media",
      "Vieja",
    ]);
  });

  it("informa del total aunque devuelva una página", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(
      sqlite,
      Array.from({ length: 25 }, (_, i) => stream({ ts: 1000 + i })),
    );

    const h = await getHistory(db, HISTORICO, { limite: 10 });
    expect(h.rows).toHaveLength(10);
    expect(h.total).toBe(25);
  });

  it("pagina con desplazamiento", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      stream({ ts: 3000, trackName: "A" }),
      stream({ ts: 2000, trackName: "B" }),
      stream({ ts: 1000, trackName: "C" }),
    ]);

    const h = await getHistory(db, HISTORICO, { limite: 1, desplazamiento: 1 });
    expect(h.rows.map((r) => r.trackName)).toEqual(["B"]);
  });

  it("busca en el título de la canción", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      stream({ trackName: "Inside Out" }),
      stream({ trackName: "Gold Dust" }),
    ]);

    const h = await getHistory(db, HISTORICO, { busqueda: "inside" });
    expect(h.rows.map((r) => r.trackName)).toEqual(["Inside Out"]);
    expect(h.total).toBe(1);
  });

  it("busca también en el nombre del artista", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      stream({ artistName: "Duster", trackName: "X" }),
      stream({ artistName: "Slowdive", trackName: "Y" }),
    ]);

    expect((await getHistory(db, HISTORICO, { busqueda: "slow" })).rows).toHaveLength(1);
  });

  it("la búsqueda ignora mayúsculas y acentos", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [stream({ artistName: "Sigur Rós" })]);

    expect((await getHistory(db, HISTORICO, { busqueda: "SIGUR ROS" })).rows).toHaveLength(1);
  });

  it("respeta el rango", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      stream({ localDate: "2026-01-15" }),
      stream({ localDate: "2026-06-15" }),
    ]);

    const enero: StatsRange = {
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
      label: "",
      preset: "custom",
    };

    expect((await getHistory(db, enero)).total).toBe(1);
  });

  it("incluye todas las escuchas, también las cortas", async () => {
    // El historial es un registro, no un ranking: si sonó tres segundos,
    // sonó, y ocultarlo haría que el usuario no entendiera sus propios datos.
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [stream({ msPlayed: 3_000 })]);
    expect((await getHistory(db, HISTORICO)).total).toBe(1);
  });
});

describe("terminosDeBusqueda", () => {
  it("parte en términos y normaliza", () => {
    expect(terminosDeBusqueda("Sigur  RÓS")).toEqual(["sigur", "ros"]);
  });

  it("descarta los espacios sueltos", () => {
    expect(terminosDeBusqueda("   ")).toEqual([]);
    expect(terminosDeBusqueda("")).toEqual([]);
  });

  // Repetir un termino no debe multiplicar las condiciones del SQL.
  it("no repite términos", () => {
    expect(terminosDeBusqueda("rock rock")).toEqual(["rock"]);
  });
});

describe("getHistory · búsqueda de varios términos", () => {
  // Con la frase entera como un solo patron habia que escribir el nombre tal
  // cual: este orden no existe en ninguna columna y no encontraba nada.
  it("acepta los términos en cualquier orden", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      stream({ artistName: "Slowdive", trackName: "Alison", albumName: "Souvlaki" }),
      stream({ artistName: "Ride", trackName: "Vapour Trail", albumName: "Nowhere" }),
    ]);
    const h = await getHistory(db, HISTORICO, { busqueda: "alison slowdive" });
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0].trackName).toBe("Alison");
  });

  it("cruza el título con el álbum", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      stream({ artistName: "Slowdive", trackName: "Alison", albumName: "Souvlaki" }),
      stream({ artistName: "Slowdive", trackName: "Dagger", albumName: "Souvlaki" }),
    ]);
    const h = await getHistory(db, HISTORICO, { busqueda: "souvlaki dagger" });
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0].trackName).toBe("Dagger");
  });

  // Escribir mas palabras siempre debe reducir, nunca ampliar.
  it("exige que estén todos", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [stream({ artistName: "Slowdive", trackName: "Alison" })]);
    expect(
      (await getHistory(db, HISTORICO, { busqueda: "alison ride" })).rows,
    ).toHaveLength(0);
  });

  it("el total refleja la búsqueda, no el rango entero", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      stream({ trackName: "Alison" }),
      stream({ trackName: "Dagger" }),
      stream({ trackName: "Dagger" }),
    ]);
    expect((await getHistory(db, HISTORICO, { busqueda: "dagger" })).total).toBe(2);
  });
});
