import { describe, it, expect } from "vitest";
import { sentidoDePuesto, variacion } from "@/lib/stats/variacion";

describe("variacion", () => {
  it("sube cuando hay más", () => {
    expect(variacion(120, 100)).toEqual({ pct: 20, sentido: "sube" });
  });

  it("baja cuando hay menos", () => {
    expect(variacion(80, 100)).toEqual({ pct: -20, sentido: "baja" });
  });

  it("redondea a entero", () => {
    expect(variacion(1124, 1000).pct).toBe(12);
    expect(variacion(1126, 1000).pct).toBe(13);
  });

  // «0 %» se lee como un dato; lo que hay que decir es que no ha pasado nada.
  it("declara igual un cambio que redondea a cero", () => {
    expect(variacion(1002, 1000)).toEqual({ pct: 0, sentido: "igual" });
    expect(variacion(100, 100)).toEqual({ pct: 0, sentido: "igual" });
  });

  describe("cuando el periodo anterior estuvo a cero", () => {
    // Un aumento desde cero no es «un infinito por ciento mas»: es la primera
    // vez, y ponerle un porcentaje seria inventarselo.
    it("no da porcentaje, da estreno", () => {
      expect(variacion(50, 0)).toEqual({ pct: null, sentido: "estreno" });
    });

    it("de cero a cero no hay nada que contar", () => {
      expect(variacion(0, 0)).toEqual({ pct: null, sentido: "igual" });
    });
  });

  describe("cuando no hay periodo anterior", () => {
    // Le pasa al preset «Historico», que no tiene nada antes.
    it("no inventa una comparación", () => {
      expect(variacion(500, null)).toEqual({ pct: null, sentido: "desconocido" });
    });
  });

  it("aguanta una caída a cero", () => {
    expect(variacion(0, 100)).toEqual({ pct: -100, sentido: "baja" });
  });
});

describe("sentidoDePuesto", () => {
  // Positivo sube: bajar de numero es mejorar, y esa inversion es la que se
  // olvida al escribirla suelta en cada pantalla.
  it("positivo es subir", () => {
    expect(sentidoDePuesto(4)).toBe("sube");
    expect(sentidoDePuesto(-4)).toBe("baja");
  });

  it("cero es igual", () => {
    expect(sentidoDePuesto(0)).toBe("igual");
  });

  // Existia tres veces con tres vocabularios: la misma entrada nueva se
  // llamaba «entra» en informes y «nuevo» en generos.
  it("sin puesto anterior, entra", () => {
    expect(sentidoDePuesto(null)).toBe("entra");
    expect(sentidoDePuesto(undefined)).toBe("entra");
  });
});
