import { describe, it, expect } from "vitest";
import { calcularPagina, paginar } from "@/lib/paginar";

const serie = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("paginar", () => {
  it("devuelve una sola página vacía si no hay nada", () => {
    expect(paginar([], 1, 10)).toEqual({
      items: [],
      actual: 1,
      paginas: 1,
      desde: 0,
    });
  });

  it("no pagina si todo cabe", () => {
    const p = paginar(serie(10), 1, 10);
    expect(p.paginas).toBe(1);
    expect(p.items).toHaveLength(10);
  });

  // El caso clasico de off-by-one: un elemento de mas obliga a una pagina mas.
  it("abre una página nueva por un solo elemento de más", () => {
    expect(paginar(serie(11), 1, 10).paginas).toBe(2);
    expect(paginar(serie(11), 2, 10).items).toEqual([11]);
  });

  it("corta cada página donde toca", () => {
    expect(paginar(serie(25), 1, 10).items).toEqual(serie(10));
    expect(paginar(serie(25), 2, 10).items[0]).toBe(11);
    expect(paginar(serie(25), 3, 10).items).toEqual([21, 22, 23, 24, 25]);
  });

  it("dice desde qué índice va la página, para numerar seguido", () => {
    expect(paginar(serie(25), 1, 10).desde).toBe(0);
    expect(paginar(serie(25), 3, 10).desde).toBe(20);
  });

  describe("páginas fuera de rango", () => {
    // Pedir la 99 de una lista de tres es un error de la URL. Devolver una
    // rejilla vacia pareceria que el filtro no tiene nada.
    it("se acotan a la última en vez de quedar vacías", () => {
      const p = paginar(serie(25), 99, 10);
      expect(p.actual).toBe(3);
      expect(p.items).toEqual([21, 22, 23, 24, 25]);
    });

    it("una página menor que uno cae en la primera", () => {
      expect(paginar(serie(25), 0, 10).actual).toBe(1);
      expect(paginar(serie(25), -5, 10).actual).toBe(1);
    });

    // `Number(params.p)` da NaN con «?p=hola», y NaN se propaga en silencio por
    // toda la aritmetica hasta producir un slice vacio.
    it("un valor que no es número cae en la primera", () => {
      expect(paginar(serie(25), NaN, 10).actual).toBe(1);
      expect(paginar(serie(25), 2.7, 10).actual).toBe(2);
    });
  });

  it("la última página exacta no deja una vacía de sobra", () => {
    const p = paginar(serie(20), 2, 10);
    expect(p.paginas).toBe(2);
    expect(p.items).toEqual(serie(20).slice(10));
  });
});

describe("calcularPagina", () => {
  it("da las mismas cuentas sin necesitar la lista", () => {
    expect(calcularPagina(25, 3, 10)).toEqual({
      actual: 3,
      paginas: 3,
      desde: 20,
    });
  });

  it("acota igual las páginas imposibles", () => {
    expect(calcularPagina(25, 99, 10).actual).toBe(3);
    expect(calcularPagina(25, 0, 10).actual).toBe(1);
    expect(calcularPagina(25, NaN, 10).actual).toBe(1);
  });

  it("un total de cero sigue siendo una página", () => {
    expect(calcularPagina(0, 1, 10)).toEqual({
      actual: 1,
      paginas: 1,
      desde: 0,
    });
  });

  // `desde` es lo que el historial usa como OFFSET del SQL.
  it("el desplazamiento sirve de OFFSET", () => {
    expect(calcularPagina(1000, 1, 100).desde).toBe(0);
    expect(calcularPagina(1000, 4, 100).desde).toBe(300);
  });
});
