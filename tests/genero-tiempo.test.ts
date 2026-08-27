import { describe, it, expect } from "vitest";
import {
  construirMezcla,
  etiquetaPeriodo,
  type FilaMes,
} from "@/lib/stats/genero-tiempo";
import { crearCanon } from "@/lib/stats/etiquetas";

/** Canon de juguete: la ortografía que se le pase es la que se enseña. */
const canon = crearCanon([
  ["indie", "punk", "jazz", "folk", "shoegaze", "dream pop", "lo-fi"],
]);

const fila = (periodo: string, key: string, plays: number): FilaMes => ({
  periodo,
  key,
  plays,
});

const mapa = (o: Record<string, string[]>) => new Map(Object.entries(o));

describe("etiquetaPeriodo", () => {
  it("abrevia el mes y recorta el año", () => {
    expect(etiquetaPeriodo("2026-08", "mes")).toBe("ago 26");
    expect(etiquetaPeriodo("2019-01", "mes")).toBe("ene 19");
  });

  // En semanas el año sobra —no caben cincuenta y dos etiquetas de todas
  // formas— y el dia es lo que situa.
  it("da el día y el mes en semanas", () => {
    expect(etiquetaPeriodo("2026-08-24", "semana")).toBe("24 ago");
  });
});

describe("construirMezcla", () => {
  it("no devuelve puntos sin datos", () => {
    expect(construirMezcla([], mapa({}), ["indie"], canon)).toEqual({
      generos: ["indie"],
      granularidad: "mes",
      puntos: [],
    });
  });

  it("no devuelve puntos si no hay generos que dibujar", () => {
    expect(
      construirMezcla([fila("2026-01", "a", 5)], mapa({}), [], canon).puntos,
    ).toEqual([]);
  });

  it("reparte cada mes en proporciones que suman uno", () => {
    const m = construirMezcla(
      [fila("2026-01", "a", 30), fila("2026-01", "b", 10)],
      mapa({ a: ["indie"], b: ["punk"] }),
      ["indie", "punk"],
      canon,
    );
    expect(m.puntos).toHaveLength(1);
    expect(m.puntos[0].partes).toEqual([0.75, 0.25]);
    expect(m.puntos[0].otros).toBe(0);
    expect(m.puntos[0].total).toBe(40);
  });

  // Un artista aporta a sus tres primeros generos a la vez, sin dividir: quien
  // escucha shoegaze escucha las tres etiquetas del artista al mismo tiempo.
  it("un artista aporta a varios generos a la vez", () => {
    const m = construirMezcla(
      [fila("2026-01", "a", 10)],
      mapa({ a: ["indie", "punk"] }),
      ["indie", "punk"],
      canon,
    );
    expect(m.puntos[0].partes).toEqual([0.5, 0.5]);
  });

  it("solo cuenta las primeras etiquetas de cada artista", () => {
    const m = construirMezcla(
      [fila("2026-01", "a", 10)],
      mapa({ a: ["indie", "punk", "jazz", "folk"] }),
      ["indie", "folk"],
      canon,
      "mes",
      3,
    );
    // «folk» es la cuarta y no entra, asi que todo su peso va a indie.
    expect(m.puntos[0].partes).toEqual([1, 0]);
  });

  describe("lo que no se dibuja", () => {
    it("va a otros y la pila llega arriba", () => {
      const m = construirMezcla(
        [fila("2026-01", "a", 25), fila("2026-01", "b", 75)],
        mapa({ a: ["indie"], b: ["jazz"] }),
        ["indie"],
        canon,
      );
      expect(m.puntos[0].partes[0]).toBe(0.25);
      expect(m.puntos[0].otros).toBe(0.75);
    });

    // Sacarlos haria que los meses peor cubiertos por la cache parecieran mas
    // puros de lo que son.
    it("incluye a los artistas sin etiquetas", () => {
      const m = construirMezcla(
        [fila("2026-01", "a", 50), fila("2026-01", "sin", 50)],
        mapa({ a: ["indie"] }),
        ["indie"],
        canon,
      );
      expect(m.puntos[0].otros).toBe(0.5);
    });

    // Las etiquetas que no son genero no cuentan como genero, pero tampoco
    // desaparecen: el artista entra en otros si no le queda ninguna dibujada.
    it("no toma por genero una decada ni un pais", () => {
      const m = construirMezcla(
        [fila("2026-01", "a", 10)],
        mapa({ a: ["80s", "british"] }),
        ["indie"],
        canon,
      );
      expect(m.puntos[0].partes).toEqual([0]);
      expect(m.puntos[0].otros).toBe(1);
    });
  });

  describe("los meses de silencio", () => {
    // Saltarselos uniria marzo con junio en una linea continua y ensenaria una
    // transicion suave donde hubo tres meses sin escuchar nada.
    it("se dibujan en cero, no se omiten", () => {
      const m = construirMezcla(
        [fila("2026-01", "a", 10), fila("2026-04", "a", 10)],
        mapa({ a: ["indie"] }),
        ["indie"],
        canon,
      );
      expect(m.puntos.map((p) => p.periodo)).toEqual([
        "2026-01", "2026-02", "2026-03", "2026-04",
      ]);
      expect(m.puntos[1]).toMatchObject({ total: 0, otros: 0, partes: [0] });
    });

    it("cruza el cambio de año", () => {
      const m = construirMezcla(
        [fila("2025-11", "a", 1), fila("2026-02", "a", 1)],
        mapa({ a: ["indie"] }),
        ["indie"],
        canon,
      );
      expect(m.puntos.map((p) => p.periodo)).toEqual([
        "2025-11", "2025-12", "2026-01", "2026-02",
      ]);
    });
  });

  it("devuelve los meses en orden aunque las filas lleguen desordenadas", () => {
    const m = construirMezcla(
      [fila("2026-03", "a", 1), fila("2026-01", "a", 1), fila("2026-02", "a", 1)],
      mapa({ a: ["indie"] }),
      ["indie"],
      canon,
    );
    expect(m.puntos.map((p) => p.periodo)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  describe("por semanas", () => {
    it("avanza de lunes en lunes", () => {
      const m = construirMezcla(
        [fila("2026-08-03", "a", 1), fila("2026-08-24", "a", 1)],
        mapa({ a: ["indie"] }),
        ["indie"],
        canon,
        "semana",
      );
      expect(m.puntos.map((p) => p.periodo)).toEqual([
        "2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24",
      ]);
    });

    it("cruza el cambio de mes y de año", () => {
      const m = construirMezcla(
        [fila("2025-12-29", "a", 1), fila("2026-01-12", "a", 1)],
        mapa({ a: ["indie"] }),
        ["indie"],
        canon,
        "semana",
      );
      expect(m.puntos.map((p) => p.periodo)).toEqual([
        "2025-12-29", "2026-01-05", "2026-01-12",
      ]);
    });

    it("deja la granularidad en el resultado", () => {
      const m = construirMezcla(
        [fila("2026-08-03", "a", 1)],
        mapa({ a: ["indie"] }),
        ["indie"],
        canon,
        "semana",
      );
      expect(m.granularidad).toBe("semana");
    });
  });

  // Las bandas llegan como clave y se dibujan con la ortografia canonica: si
  // el reparto dijera «lo-fi» y la mezcla «lofi», la leyenda no cuadraria con
  // la lista de al lado.
  describe("las variantes con guion", () => {
    it("son un solo género", () => {
      const m = construirMezcla(
        [fila("2026-01", "a", 50), fila("2026-01", "b", 50)],
        mapa({ a: ["lo-fi"], b: ["lo fi"] }),
        ["lofi"],
        canon,
      );
      expect(m.puntos[0].partes).toEqual([1]);
      expect(m.puntos[0].otros).toBe(0);
    });

    it("se dibujan con la ortografía canónica", () => {
      const m = construirMezcla(
        [fila("2026-01", "a", 10)],
        mapa({ a: ["lo fi"] }),
        ["lofi"],
        canon,
      );
      expect(m.generos).toEqual(["lo-fi"]);
    });
  });
});
