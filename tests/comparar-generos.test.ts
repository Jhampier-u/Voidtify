import { describe, it, expect } from "vitest";
import { compararGeneros, salieron } from "@/lib/stats/comparar-generos";
import { rangoAnterior } from "@/lib/stats/range";
import type { StatsRange } from "@/lib/stats/range";

describe("compararGeneros", () => {
  it("no marca movimiento si nadie se movió", () => {
    expect(compararGeneros(["a", "b"], ["a", "b"])).toEqual([
      { name: "a", delta: 0 },
      { name: "b", delta: 0 },
    ]);
  });

  // Positivo sube: bajar de numero es mejorar.
  it("es positivo al subir de puesto", () => {
    const r = compararGeneros(["b", "a"], ["a", "b"]);
    expect(r).toEqual([
      { name: "b", delta: 1 },
      { name: "a", delta: -1 },
    ]);
  });

  it("es null para el que no estaba", () => {
    expect(compararGeneros(["nuevo"], ["a"])).toEqual([
      { name: "nuevo", delta: null },
    ]);
  });

  it("mide contra la lista entera, no solo contra la parte visible", () => {
    // Estaba el vigesimo y ahora es el primero: son diecinueve puestos.
    const anteriores = Array.from({ length: 20 }, (_, i) => `g${i}`);
    expect(compararGeneros(["g19"], anteriores)[0].delta).toBe(19);
  });

  it("sin periodo anterior todo es nuevo", () => {
    expect(compararGeneros(["a", "b"], []).every((c) => c.delta === null)).toBe(true);
  });
});

describe("salieron", () => {
  it("son los del top anterior que ya no están", () => {
    expect(salieron(["a", "nuevo"], ["a", "b"])).toEqual(["b"]);
  });

  it("está vacío si no se fue nadie", () => {
    expect(salieron(["a", "b"], ["b", "a"])).toEqual([]);
  });

  // Que el genero ciento veinte haya desaparecido no es noticia, y listarlo
  // enterraria los que si lo son.
  it("solo mira los primeros del periodo anterior", () => {
    const anteriores = ["a", "b", "c", "d"];
    expect(salieron([], anteriores, 2)).toEqual(["a", "b"]);
  });
});

describe("rangoAnterior", () => {
  const rango = (
    fromDate: string,
    toDate: string,
    preset: StatsRange["preset"] = "4w",
  ): StatsRange => ({ fromDate, toDate, label: "", preset });

  it("es el periodo de igual duración justo antes", () => {
    // Del 1 al 28 son veintiocho dias: el anterior va del 4 al 31 de julio.
    expect(rangoAnterior(rango("2026-08-01", "2026-08-28"))).toMatchObject({
      fromDate: "2026-07-04",
      toDate: "2026-07-31",
    });
  });

  // Si compartieran el primer dia, el mismo dato contaria en los dos lados.
  it("termina el día antes de que empiece el actual", () => {
    expect(rangoAnterior(rango("2026-08-01", "2026-08-28"))!.toDate).toBe(
      "2026-07-31",
    );
  });

  it("aguanta un rango de un solo día", () => {
    expect(rangoAnterior(rango("2026-08-10", "2026-08-10"))).toMatchObject({
      fromDate: "2026-08-09",
      toDate: "2026-08-09",
    });
  });

  it("cruza el cambio de año", () => {
    expect(rangoAnterior(rango("2026-01-01", "2026-01-10"))).toMatchObject({
      fromDate: "2025-12-22",
      toDate: "2025-12-31",
    });
  });

  // Su inicio es un centinela de 1970: inventar un periodo previo daria deltas
  // contra el vacio que se leerian como crecimientos espectaculares.
  it("no existe en el histórico", () => {
    expect(rangoAnterior(rango("1970-01-01", "2026-08-26", "all"))).toBeNull();
  });
});
