import { describe, it, expect } from "vitest";
import { construirSerie, etiquetaDia, etiquetaMes } from "@/lib/stats/serie";

const mes = (month: string, plays = 10) => ({ month, plays });
const dia = (date: string, plays = 10) => ({ date, plays });

describe("etiquetas", () => {
  it("nombra el mes en corto", () => {
    expect(etiquetaMes("2026-08")).toBe("ago 26");
    expect(etiquetaMes("2026-01")).toBe("ene 26");
  });

  it("nombra el día sin cero a la izquierda", () => {
    expect(etiquetaDia("2026-08-05")).toBe("5 ago");
  });
});

describe("construirSerie", () => {
  // El caso que motivó todo: en un rango de cuatro semanas hay dos meses, y
  // dos puntos unidos son un segmento recto que sugiere un crecimiento continuo
  // que nunca ocurrió.
  it("dibuja por días cuando hay pocos meses", () => {
    const s = construirSerie(
      [dia("2026-08-01"), dia("2026-08-03")],
      [mes("2026-07"), mes("2026-08")],
      "2026-08-01",
      "2026-08-03",
    );
    expect(s.granularidad).toBe("dia");
    expect(s.puntos).toHaveLength(3);
  });

  it("dibuja por meses cuando hay suficientes", () => {
    const s = construirSerie(
      [],
      [mes("2026-05"), mes("2026-06"), mes("2026-07"), mes("2026-08")],
      "2026-05-01",
      "2026-08-31",
    );
    expect(s.granularidad).toBe("mes");
    expect(s.puntos.map((p) => p.clave)).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  describe("los huecos", () => {
    // Omitirlos haria que dos dias separados por una semana de silencio
    // salieran contiguos, y la linea uniria dos picos como si no hubiera pasado
    // nada entre medias.
    it("se rellenan con cero, no se omiten", () => {
      const s = construirSerie(
        [dia("2026-08-01", 5), dia("2026-08-04", 8)],
        [mes("2026-08")],
        "2026-08-01",
        "2026-08-04",
      );
      expect(s.puntos.map((p) => p.plays)).toEqual([5, 0, 0, 8]);
    });

    it("cubre el rango entero aunque no haya ni un dato", () => {
      const s = construirSerie([], [], "2026-08-01", "2026-08-05");
      expect(s.puntos).toHaveLength(5);
      expect(s.puntos.every((p) => p.plays === 0)).toBe(true);
    });
  });

  it("cruza el cambio de mes", () => {
    const s = construirSerie([], [], "2026-07-30", "2026-08-02");
    expect(s.puntos.map((p) => p.clave)).toEqual([
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
  });

  it("cruza el cambio de año", () => {
    const s = construirSerie([], [], "2025-12-31", "2026-01-01");
    expect(s.puntos.map((p) => p.clave)).toEqual(["2025-12-31", "2026-01-01"]);
  });

  it("cuenta bien un febrero bisiesto", () => {
    const s = construirSerie([], [], "2028-02-28", "2028-03-01");
    expect(s.puntos.map((p) => p.clave)).toEqual([
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });

  it("aguanta un rango de un solo día", () => {
    const s = construirSerie([dia("2026-08-01", 3)], [], "2026-08-01", "2026-08-01");
    expect(s.puntos).toEqual([
      { clave: "2026-08-01", etiqueta: "1 ago", plays: 3 },
    ]);
  });
});

// La ficha de una cancion solo trae su reparto por meses: sin datos diarios no
// se puede dibujar por dias aunque el rango sea corto.
describe("construirSerie sin datos diarios", () => {
  it("cae a meses aunque haya pocos", () => {
    const s = construirSerie([], [mes("2026-07"), mes("2026-08")], "2026-07-01", "2026-08-31");
    expect(s.granularidad).toBe("mes");
    expect(s.puntos).toHaveLength(2);
  });

  it("pero si no hay ni meses, rellena los días a cero", () => {
    const s = construirSerie([], [], "2026-08-01", "2026-08-02");
    expect(s.granularidad).toBe("dia");
    expect(s.puntos).toHaveLength(2);
  });
});
