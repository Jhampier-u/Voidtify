import { describe, it, expect } from "vitest";
import {
  construirMezcla,
  etiquetaMes,
  type FilaMes,
} from "@/lib/stats/genero-tiempo";

const fila = (mes: string, key: string, plays: number): FilaMes => ({
  mes,
  key,
  plays,
});

const mapa = (o: Record<string, string[]>) => new Map(Object.entries(o));

describe("etiquetaMes", () => {
  it("abrevia el mes y recorta el año", () => {
    expect(etiquetaMes("2026-08")).toBe("ago 26");
    expect(etiquetaMes("2019-01")).toBe("ene 19");
  });
});

describe("construirMezcla", () => {
  it("no devuelve puntos sin datos", () => {
    expect(construirMezcla([], mapa({}), ["indie"])).toEqual({
      generos: ["indie"],
      puntos: [],
    });
  });

  it("no devuelve puntos si no hay generos que dibujar", () => {
    expect(construirMezcla([fila("2026-01", "a", 5)], mapa({}), []).puntos).toEqual([]);
  });

  it("reparte cada mes en proporciones que suman uno", () => {
    const m = construirMezcla(
      [fila("2026-01", "a", 30), fila("2026-01", "b", 10)],
      mapa({ a: ["indie"], b: ["punk"] }),
      ["indie", "punk"],
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
    );
    expect(m.puntos[0].partes).toEqual([0.5, 0.5]);
  });

  it("solo cuenta las primeras etiquetas de cada artista", () => {
    const m = construirMezcla(
      [fila("2026-01", "a", 10)],
      mapa({ a: ["indie", "punk", "jazz", "folk"] }),
      ["indie", "folk"],
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
      );
      expect(m.puntos.map((p) => p.mes)).toEqual([
        "2026-01", "2026-02", "2026-03", "2026-04",
      ]);
      expect(m.puntos[1]).toMatchObject({ total: 0, otros: 0, partes: [0] });
    });

    it("cruza el cambio de año", () => {
      const m = construirMezcla(
        [fila("2025-11", "a", 1), fila("2026-02", "a", 1)],
        mapa({ a: ["indie"] }),
        ["indie"],
      );
      expect(m.puntos.map((p) => p.mes)).toEqual([
        "2025-11", "2025-12", "2026-01", "2026-02",
      ]);
    });
  });

  it("devuelve los meses en orden aunque las filas lleguen desordenadas", () => {
    const m = construirMezcla(
      [fila("2026-03", "a", 1), fila("2026-01", "a", 1), fila("2026-02", "a", 1)],
      mapa({ a: ["indie"] }),
      ["indie"],
    );
    expect(m.puntos.map((p) => p.mes)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
});
