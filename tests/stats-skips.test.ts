import { describe, expect, it } from "vitest";
import { getSkipStats, getMostSkippedArtists } from "@/lib/stats/skips";
import { getByDate } from "@/lib/stats/time";
import type { StatsRange } from "@/lib/stats/range";
import { createTestDb } from "./helpers/test-db";
import { seedStreams, stream } from "./helpers/seed-streams";

const TODO: StatsRange = {
  fromDate: "1970-01-01",
  toDate: "2099-12-31",
  label: "Histórico",
  preset: "all",
};

const d = "2026-03-10";

describe("getSkipStats", () => {
  it("sin datos devuelve ceros y desde nulo", async () => {
    const { db } = createTestDb();
    expect(await getSkipStats(db, TODO)).toEqual({
      conDatos: 0,
      abandonadas: 0,
      tasa: 0,
      desde: null,
      hastaEnArchivo: null,
    });
  });

  it("ignora las filas capturadas en vivo", async () => {
    // La API no informa de abandono: contarlas como no abandonadas hundiría
    // la tasa sin que nada lo indicara.
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      stream({ localDate: d, source: "live", skipped: null }),
      stream({ localDate: d, source: "live", skipped: null }),
    ]);

    expect((await getSkipStats(db, TODO)).conDatos).toBe(0);
  });

  it("calcula la tasa sobre las filas importadas", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      stream({ localDate: d, source: "import", skipped: 1 }),
      stream({ localDate: d, source: "import", skipped: 0 }),
      stream({ localDate: d, source: "import", skipped: 0 }),
      stream({ localDate: d, source: "import", skipped: 0 }),
    ]);

    const s = await getSkipStats(db, TODO);
    expect(s.conDatos).toBe(4);
    expect(s.abandonadas).toBe(1);
    expect(s.tasa).toBe(0.25);
  });

  it("no mezcla filas live aunque haya importadas", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      stream({ localDate: d, source: "import", skipped: 1 }),
      stream({ localDate: d, source: "live", skipped: null }),
      stream({ localDate: d, source: "live", skipped: null }),
    ]);

    const s = await getSkipStats(db, TODO);
    expect(s.conDatos).toBe(1);
    expect(s.tasa).toBe(1);
  });

  it("informa desde qué día hay datos fiables", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      stream({ localDate: "2020-05-05", source: "import", skipped: 0 }),
      stream({ localDate: "2019-01-01", source: "import", skipped: 1 }),
    ]);

    expect((await getSkipStats(db, TODO)).desde).toBe("2019-01-01");
  });

  it("respeta el rango", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      stream({ localDate: "2026-01-15", source: "import", skipped: 1 }),
      stream({ localDate: "2026-06-15", source: "import", skipped: 0 }),
    ]);

    const enero: StatsRange = {
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
      label: "",
      preset: "custom",
    };

    const s = await getSkipStats(db, enero);
    expect(s.conDatos).toBe(1);
    expect(s.tasa).toBe(1);
  });
});

describe("getMostSkippedArtists", () => {
  function filas(artista: string, saltadas: number, total: number) {
    return Array.from({ length: total }, (_, i) =>
      stream({
        localDate: d,
        source: "import",
        artistName: artista,
        skipped: i < saltadas ? 1 : 0,
      }),
    );
  }

  it("ordena por tasa descendente", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      ...filas("Muy saltado", 8, 20),
      ...filas("Poco saltado", 2, 20),
    ]);

    const r = await getMostSkippedArtists(db, TODO);
    expect(r.map((a) => a.name)).toEqual(["Muy saltado", "Poco saltado"]);
    expect(r[0].tasa).toBeCloseTo(0.4);
  });

  it("excluye artistas por debajo del mínimo de escuchas", async () => {
    // Una tasa del 100 % sobre una sola reproducción no dice nada de nadie.
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      ...filas("Anecdótico", 1, 1),
      ...filas("Con historial", 5, 20),
    ]);

    const r = await getMostSkippedArtists(db, TODO);
    expect(r.map((a) => a.name)).toEqual(["Con historial"]);
  });

  it("el mínimo es configurable", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [...filas("Pocos", 2, 5)]);

    expect(await getMostSkippedArtists(db, TODO, 20)).toHaveLength(0);
    expect(await getMostSkippedArtists(db, TODO, 5)).toHaveLength(1);
  });

  it("respeta el límite", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(
      sqlite,
      Array.from({ length: 5 }, (_, i) => filas(`Artista ${i}`, 5, 20)).flat(),
    );

    expect(await getMostSkippedArtists(db, TODO, 20, 3)).toHaveLength(3);
  });
});

describe("getByDate", () => {
  it("devuelve vacío sin datos", async () => {
    const { db } = createTestDb();
    expect(await getByDate(db, TODO)).toEqual([]);
  });

  it("agrupa por día local y ordena cronológicamente", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      stream({ localDate: "2026-03-11" }),
      stream({ localDate: "2026-03-10" }),
      stream({ localDate: "2026-03-10" }),
    ]);

    const r = await getByDate(db, TODO);
    expect(r.map((x) => x.date)).toEqual(["2026-03-10", "2026-03-11"]);
    expect(r[0].plays).toBe(2);
  });

  it("no inventa días vacíos entre dos con datos", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      stream({ localDate: "2026-01-01" }),
      stream({ localDate: "2026-12-31" }),
    ]);

    expect(await getByDate(db, TODO)).toHaveLength(2);
  });

  it("suma también los milisegundos", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      stream({ localDate: d, msPlayed: 100_000 }),
      stream({ localDate: d, msPlayed: 50_000 }),
    ]);

    expect((await getByDate(db, TODO))[0].ms).toBe(150_000);
  });
});

// El abandono solo llega en el volcado, que termina el dia en que se pidio.
// Cualquier rango posterior no tiene ni una fila, y sin este dato la pantalla
// no podria distinguir «no saltas nada» de «aqui no hay informacion».
describe("getSkipStats · limite del dato", () => {
  it("dice hasta cuándo hay abandono en todo el archivo", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      stream({ localDate: "2026-07-20", source: "import", skipped: 1 }),
      stream({ localDate: "2026-07-26", source: "import", skipped: 0 }),
      // Capturada en vivo: no trae dato de salto y no debe correr el limite.
      stream({ localDate: "2026-08-20", source: "live", skipped: null }),
    ]);
    const s = await getSkipStats(db, TODO);
    expect(s.hastaEnArchivo).toBe("2026-07-26");
  });

  // Es el limite del dato, no el del periodo: sirve justo para explicar un
  // rango vacio, asi que no puede depender del rango.
  it("no lo recorta el rango consultado", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      stream({ localDate: "2026-07-26", source: "import", skipped: 1 }),
    ]);
    const s = await getSkipStats(db, {
      fromDate: "2026-08-01",
      toDate: "2026-08-31",
      label: "agosto",
      preset: "custom",
    });
    expect(s.conDatos).toBe(0);
    expect(s.hastaEnArchivo).toBe("2026-07-26");
  });
});
