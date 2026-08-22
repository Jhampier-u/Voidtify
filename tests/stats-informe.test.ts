import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./helpers/test-db";
import { seedStreams, stream } from "./helpers/seed-streams";
import { getInforme, periodosConDatos } from "@/lib/stats/informe";
import { lunesDe } from "@/lib/stats/periodo";
import type { Db } from "@/lib/stats/shared";

describe("periodosConDatos", () => {
  let db: Db;
  let sqlite: ReturnType<typeof createTestDb>["sqlite"];

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    sqlite = t.sqlite;
  });

  it("devuelve los meses con datos, del más nuevo al más viejo", async () => {
    seedStreams(sqlite, [
      stream({ localDate: "2026-08-05" }),
      stream({ localDate: "2026-06-01" }),
      stream({ localDate: "2026-08-20" }),
    ]);
    expect(await periodosConDatos(db, "mes")).toEqual(["2026-08", "2026-06"]);
  });

  it("devuelve los años con datos", async () => {
    seedStreams(sqlite, [
      stream({ localDate: "2019-03-02" }),
      stream({ localDate: "2026-08-05" }),
    ]);
    expect(await periodosConDatos(db, "anio")).toEqual(["2026", "2019"]);
  });

  it("no inventa periodos vacíos entre dos con datos", async () => {
    seedStreams(sqlite, [
      stream({ localDate: "2026-01-05" }),
      stream({ localDate: "2026-08-05" }),
    ]);
    expect(await periodosConDatos(db, "mes")).toEqual(["2026-08", "2026-01"]);
  });

  // El lunes de una fecha se calcula en dos sitios: en SQL para agrupar sin
  // traerse 272.000 filas a memoria, y en JavaScript para la aritmética de
  // periodos. Si las dos versiones discreparan, la lista de semanas y el rango
  // consultado hablarían de semanas distintas y nadie lo notaría.
  describe("el lunes en SQL coincide con el de JavaScript", () => {
    const fechas = [
      "2026-08-03", // lunes
      "2026-08-05", // miércoles
      "2026-08-09", // domingo
      "2026-01-01", // cruza el año
      "2028-02-29", // bisiesto
      "2025-12-31",
    ];

    it.each(fechas)("para %s", async (fecha) => {
      const t = createTestDb();
      seedStreams(t.sqlite, [stream({ localDate: fecha })]);
      expect(await periodosConDatos(t.db, "semana")).toEqual([lunesDe(fecha)]);
    });

    it("agrupa toda una semana bajo el mismo lunes", async () => {
      seedStreams(sqlite, [
        stream({ localDate: "2026-08-03" }),
        stream({ localDate: "2026-08-06" }),
        stream({ localDate: "2026-08-09" }),
      ]);
      expect(await periodosConDatos(db, "semana")).toEqual(["2026-08-03"]);
    });
  });
});

describe("getInforme", () => {
  let db: Db;
  let sqlite: ReturnType<typeof createTestDb>["sqlite"];

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    sqlite = t.sqlite;
  });

  it("compara el mes con el anterior", async () => {
    seedStreams(sqlite, [
      // Julio: manda Slowdive.
      stream({ localDate: "2026-07-10", artistName: "Slowdive" }),
      stream({ localDate: "2026-07-11", artistName: "Slowdive" }),
      stream({ localDate: "2026-07-12", artistName: "Ride" }),
      // Agosto: se da la vuelta y aparece Lush.
      stream({ localDate: "2026-08-01", artistName: "Ride" }),
      stream({ localDate: "2026-08-02", artistName: "Ride" }),
      stream({ localDate: "2026-08-03", artistName: "Lush" }),
    ]);

    const inf = await getInforme(db, "mes", "2026-08");

    expect(inf.periodoAnterior).toBe("2026-07");
    expect(inf.actual.reproducciones).toBe(3);
    expect(inf.previo.reproducciones).toBe(3);

    const nombres = inf.artistas.filas.map((f) => f.name);
    expect(nombres[0]).toBe("Ride");

    const ride = inf.artistas.filas.find((f) => f.name === "Ride")!;
    expect(ride.movimiento).toBe("sube");
    expect(ride.playsAnterior).toBe(1);

    const lush = inf.artistas.filas.find((f) => f.name === "Lush")!;
    expect(lush.movimiento).toBe("nuevo");

    expect(inf.artistas.salen.map((s) => s.name)).toEqual(["Slowdive"]);
  });

  // Un periodo sin nada detrás es lo normal en el primero de todos, y no debe
  // reventar ni marcar todo como novedad falsa.
  it("aguanta que el periodo anterior esté vacío", async () => {
    seedStreams(sqlite, [stream({ localDate: "2026-08-01" })]);
    const inf = await getInforme(db, "mes", "2026-08");

    expect(inf.previo.reproducciones).toBe(0);
    expect(inf.artistas.salen).toEqual([]);
    expect(inf.artistas.filas[0].movimiento).toBe("nuevo");
  });

  it("compara semanas usando el lunes como identificador", async () => {
    seedStreams(sqlite, [
      stream({ localDate: "2026-07-28", artistName: "Slowdive" }),
      stream({ localDate: "2026-08-05", artistName: "Ride" }),
    ]);
    const inf = await getInforme(db, "semana", "2026-08-03");

    expect(inf.periodoAnterior).toBe("2026-07-27");
    expect(inf.actual.reproducciones).toBe(1);
    expect(inf.previo.reproducciones).toBe(1);
    expect(inf.artistas.filas[0].name).toBe("Ride");
    expect(inf.artistas.salen[0].name).toBe("Slowdive");
  });
});
