import { describe, it, expect } from "vitest";
import {
  esNivel,
  oyentesCompactos,
  pasaRareza,
  UMBRALES,
} from "@/lib/descubrir/rareza";

describe("pasaRareza", () => {
  it("con «todo» pasa cualquiera, incluso sin dato", () => {
    expect(pasaRareza(9_000_000, "todo")).toBe(true);
    expect(pasaRareza(undefined, "todo")).toBe(true);
    expect(pasaRareza(null, "todo")).toBe(true);
  });

  it("deja pasar al que baja del umbral", () => {
    expect(pasaRareza(1_200, "rareza")).toBe(true);
    expect(pasaRareza(40_000, "poco")).toBe(true);
  });

  it("corta al que lo alcanza o lo supera", () => {
    expect(pasaRareza(UMBRALES.rareza!, "rareza")).toBe(false);
    expect(pasaRareza(900_000, "poco")).toBe(false);
  });

  // Dejarlo pasar seria ensenar como rareza algo que a lo mejor tiene diez
  // millones de oyentes, y eso convierte el filtro en un adorno.
  describe("cuando no se sabe", () => {
    it("no pasa si el dato aun no ha llegado", () => {
      expect(pasaRareza(undefined, "rareza")).toBe(false);
    });

    it("tampoco pasa si Last.fm no da la cifra", () => {
      expect(pasaRareza(null, "poco")).toBe(false);
    });
  });

  it("los niveles se encajan: lo raro es tambien poco conocido", () => {
    expect(pasaRareza(1_000, "poco")).toBe(true);
    expect(pasaRareza(20_000, "rareza")).toBe(false);
  });
});

describe("esNivel", () => {
  it("acepta los tres y rechaza lo demas", () => {
    expect(["todo", "poco", "rareza"].every(esNivel)).toBe(true);
    expect(esNivel("cualquiera")).toBe(false);
  });
});

describe("oyentesCompactos", () => {
  it("abrevia por encima del millar", () => {
    expect(oyentesCompactos(912)).toBe("912");
    expect(oyentesCompactos(84_300)).toBe("84 K");
    expect(oyentesCompactos(1_240_000)).toBe("1,2 M");
  });
});
