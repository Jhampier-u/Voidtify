import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./helpers/test-db";
import { seedStreams, stream } from "./helpers/seed-streams";
import { getTotalesDeDias } from "@/lib/stats/history";
import type { Db } from "@/lib/stats/shared";

describe("getTotalesDeDias", () => {
  let db: Db;
  let sqlite: ReturnType<typeof createTestDb>["sqlite"];

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    sqlite = t.sqlite;
  });

  it("no consulta nada si no se piden días", async () => {
    expect(await getTotalesDeDias(db, [])).toEqual({});
  });

  it("suma reproducciones y tiempo de cada día", async () => {
    seedStreams(sqlite, [
      stream({ localDate: "2026-08-25", msPlayed: 120_000 }),
      stream({ localDate: "2026-08-25", msPlayed: 180_000 }),
      stream({ localDate: "2026-08-24", msPlayed: 60_000 }),
    ]);

    const t = await getTotalesDeDias(db, ["2026-08-25", "2026-08-24"]);
    expect(t["2026-08-25"]).toEqual({ plays: 2, ms: 300_000 });
    expect(t["2026-08-24"]).toEqual({ plays: 1, ms: 60_000 });
  });

  it("omite los días sin datos en vez de devolver ceros", async () => {
    seedStreams(sqlite, [stream({ localDate: "2026-08-25" })]);
    const t = await getTotalesDeDias(db, ["2026-08-25", "2026-01-01"]);
    expect(Object.keys(t)).toEqual(["2026-08-25"]);
  });

  // Es la razon de que esta funcion exista. El historial pagina de cien en
  // cien, un dia puede quedar partido entre dos paginas, y contar solo las
  // filas visibles daria una cifra que cambia al pasar de pagina sin que
  // cambien los datos.
  it("cuenta el día entero, no solo lo que se está viendo", async () => {
    seedStreams(
      sqlite,
      Array.from({ length: 40 }, () => stream({ localDate: "2026-08-25" })),
    );
    expect((await getTotalesDeDias(db, ["2026-08-25"]))["2026-08-25"].plays).toBe(
      40,
    );
  });

  // Las reproducciones cortas cuentan aqui: la cabecera dice lo que sono ese
  // dia, no lo que supera el umbral de reproduccion contada.
  it("incluye las reproducciones que no llegan al umbral", async () => {
    seedStreams(sqlite, [
      stream({ localDate: "2026-08-25", msPlayed: 5_000 }),
      stream({ localDate: "2026-08-25", msPlayed: 200_000 }),
    ]);
    expect((await getTotalesDeDias(db, ["2026-08-25"]))["2026-08-25"]).toEqual({
      plays: 2,
      ms: 205_000,
    });
  });
});
