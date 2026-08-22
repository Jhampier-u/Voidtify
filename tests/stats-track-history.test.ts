import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./helpers/test-db";
import { seedStreams, stream } from "./helpers/seed-streams";
import { getTrackHistory } from "@/lib/stats/track-history";
import { trackKey } from "@/lib/stats/normalize";
import type { Db } from "@/lib/stats/shared";

const DIA = 86_400_000;
const AHORA = 1_800_000_000_000;

const ALISON = trackKey("Slowdive", "Alison");
const DAGGER = trackKey("Slowdive", "Dagger");

describe("getTrackHistory", () => {
  let db: Db;
  let sqlite: ReturnType<typeof createTestDb>["sqlite"];

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    sqlite = t.sqlite;
  });

  it("no devuelve entrada para una canción que nunca sonó", async () => {
    const h = await getTrackHistory(db, [ALISON], AHORA);
    expect(h.get(ALISON)).toBeUndefined();
    expect(h.size).toBe(0);
  });

  it("cuenta solo las reproducciones que pasan el umbral", async () => {
    seedStreams(sqlite, [
      stream({ msPlayed: 210_000 }),
      stream({ msPlayed: 210_000 }),
      stream({ msPlayed: 5_000 }), // no llega a 30 s
    ]);
    expect((await getTrackHistory(db, [ALISON], AHORA)).get(ALISON)!.plays).toBe(2);
  });

  // El tiempo escuchado no se filtra por el umbral: si algo sonó cinco
  // segundos, esos cinco segundos se escucharon. Mismo criterio que el resto
  // de las estadísticas.
  it("suma el tiempo de todas, incluidas las que no llegan al umbral", async () => {
    seedStreams(sqlite, [
      stream({ msPlayed: 210_000 }),
      stream({ msPlayed: 5_000 }),
    ]);
    expect((await getTrackHistory(db, [ALISON], AHORA)).get(ALISON)!.ms).toBe(215_000);
  });

  it("registra la primera y la última vez", async () => {
    seedStreams(sqlite, [
      stream({ ts: AHORA - 30 * DIA }),
      stream({ ts: AHORA - 2 * DIA }),
      stream({ ts: AHORA - 90 * DIA }),
    ]);
    const h = (await getTrackHistory(db, [ALISON], AHORA)).get(ALISON)!;
    expect(h.primeraVez).toBe(AHORA - 90 * DIA);
    expect(h.ultimaVez).toBe(AHORA - 2 * DIA);
  });

  it("cuenta los días desde la última vez", async () => {
    seedStreams(sqlite, [stream({ ts: AHORA - 400 * DIA })]);
    const h = (await getTrackHistory(db, [ALISON], AHORA)).get(ALISON)!;
    expect(h.diasDesdeUltima).toBe(400);
  });

  it("da la hora del día en que más suele sonar", async () => {
    seedStreams(sqlite, [
      stream({ localHour: 23 }),
      stream({ localHour: 23 }),
      stream({ localHour: 9 }),
    ]);
    expect((await getTrackHistory(db, [ALISON], AHORA)).get(ALISON)!.horaModal).toBe(23);
  });

  // Sin desempate explícito, SQLite podría devolver cualquiera de las dos y el
  // valor cambiaría entre ejecuciones sin que los datos cambien.
  it("desempata la hora modal por la más temprana", async () => {
    seedStreams(sqlite, [stream({ localHour: 22 }), stream({ localHour: 8 })]);
    expect((await getTrackHistory(db, [ALISON], AHORA)).get(ALISON)!.horaModal).toBe(8);
  });

  describe("tasa de abandono", () => {
    // `recently-played` no dice si una canción se saltó, así que las filas en
    // vivo llevan `skipped` a NULL. Contarlas como "no abandonadas" daría un
    // número plausible y falso, que es peor que no dar número.
    it("es null cuando solo hay capturas en vivo", async () => {
      seedStreams(sqlite, [stream({ source: "live", skipped: null })]);
      const h = (await getTrackHistory(db, [ALISON], AHORA)).get(ALISON)!;
      expect(h.tasaSalto).toBeNull();
      expect(h.conDatosSalto).toBe(0);
    });

    it("se calcula sobre las filas importadas con dato", async () => {
      seedStreams(sqlite, [
        stream({ source: "import", skipped: 1 }),
        stream({ source: "import", skipped: 1 }),
        stream({ source: "import", skipped: 0 }),
        stream({ source: "import", skipped: 0 }),
        stream({ source: "live", skipped: null }),
      ]);
      const h = (await getTrackHistory(db, [ALISON], AHORA)).get(ALISON)!;
      expect(h.conDatosSalto).toBe(4);
      expect(h.abandonadas).toBe(2);
      expect(h.tasaSalto).toBe(0.5);
    });
  });

  // El mismo tema tiene URIs distintas según la edición o el mercado. Agrupar
  // por URI partiría su historia en trozos; por eso la clave es el nombre
  // normalizado, igual que en el resto de las estadísticas.
  it("agrupa las ediciones distintas de una misma canción", async () => {
    seedStreams(sqlite, [
      stream({ trackUri: "spotify:track:edicionA" }),
      stream({ trackUri: "spotify:track:edicionB" }),
      stream({ trackUri: null }),
    ]);
    expect((await getTrackHistory(db, [ALISON], AHORA)).get(ALISON)!.plays).toBe(3);
  });

  it("separa canciones distintas del mismo artista", async () => {
    seedStreams(sqlite, [
      stream({ trackName: "Alison" }),
      stream({ trackName: "Dagger" }),
      stream({ trackName: "Dagger" }),
    ]);
    const h = await getTrackHistory(db, [ALISON, DAGGER], AHORA);
    expect(h.get(ALISON)!.plays).toBe(1);
    expect(h.get(DAGGER)!.plays).toBe(2);
  });

  it("ignora las claves pedidas que no existen", async () => {
    seedStreams(sqlite, [stream({ trackName: "Alison" })]);
    const h = await getTrackHistory(db, [ALISON, DAGGER], AHORA);
    expect(h.size).toBe(1);
  });

  it("devuelve un mapa vacío si no se piden claves", async () => {
    seedStreams(sqlite, [stream()]);
    expect((await getTrackHistory(db, [], AHORA)).size).toBe(0);
  });

  // SQLite corta por defecto en 999 parámetros por consulta. Sin trocear, una
  // playlist grande lanzaría "too many SQL variables" en producción y nunca en
  // los tests, que suelen usar tres filas.
  it("trocea cuando se piden más claves que el límite de SQLite", async () => {
    const claves: string[] = [];
    for (let i = 0; i < 1200; i++) claves.push(trackKey("Slowdive", `Tema ${i}`));
    seedStreams(sqlite, [stream({ trackName: "Tema 1100" })]);

    const h = await getTrackHistory(db, claves, AHORA);
    expect(h.get(trackKey("Slowdive", "Tema 1100"))!.plays).toBe(1);
  });
});
