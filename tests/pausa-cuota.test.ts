import { describe, it, expect } from "vitest";
import {
  enPausa,
  esperaDe,
  pausar,
  quedanSegundos,
  type Pausas,
} from "@/lib/capture/pausa-cuota";
import { SpotifyApiError } from "@/lib/spotify-core";

const AHORA = 1_700_000_000_000;

describe("esperaDe", () => {
  it("devuelve los segundos que pide Spotify", () => {
    expect(esperaDe(new SpotifyApiError("cuota", 429, 623))).toBe(623);
  });

  // spotify-core solo rellena retryAfterSec cuando la espera pasa de un minuto;
  // en los demas 429 llega sin cifra y hay que asumir una.
  it("asume un minuto si el 429 no dice cuanto", () => {
    expect(esperaDe(new SpotifyApiError("cuota", 429))).toBe(60);
  });

  describe("no es una cuota", () => {
    // Esperar no arregla un permiso retirado ni un cable suelto: tratarlos como
    // cuota dejaria el relleno parado sin motivo.
    it("un 403 no lo es", () => {
      expect(esperaDe(new SpotifyApiError("prohibido", 403))).toBeNull();
    });

    it("un error de red tampoco", () => {
      expect(esperaDe(new TypeError("fetch failed"))).toBeNull();
    });

    it("ni nada que no sea un error", () => {
      expect(esperaDe("429")).toBeNull();
      expect(esperaDe(null)).toBeNull();
    });
  });
});

describe("las pausas", () => {
  it("no hay ninguna al empezar", () => {
    expect(enPausa({}, "pistas", AHORA)).toBe(false);
    expect(quedanSegundos({}, "pistas", AHORA)).toBe(0);
  });

  it("callan al endpoint durante los segundos pedidos", () => {
    const p: Pausas = {};
    pausar(p, "pistas", 600, AHORA);
    expect(enPausa(p, "pistas", AHORA)).toBe(true);
    expect(enPausa(p, "pistas", AHORA + 599_000)).toBe(true);
    expect(enPausa(p, "pistas", AHORA + 600_000)).toBe(false);
  });

  // Las cuotas de Spotify son por endpoint: /search puede funcionar mientras
  // /tracks/{id} esta cerrado. Un interruptor global pararia los dos.
  it("son independientes entre endpoints", () => {
    const p: Pausas = {};
    pausar(p, "pistas", 600, AHORA);
    expect(enPausa(p, "busqueda", AHORA)).toBe(false);
  });

  it("dicen cuanto queda, redondeando hacia arriba", () => {
    const p: Pausas = {};
    pausar(p, "pistas", 600, AHORA);
    expect(quedanSegundos(p, "pistas", AHORA)).toBe(600);
    expect(quedanSegundos(p, "pistas", AHORA + 599_500)).toBe(1);
    expect(quedanSegundos(p, "pistas", AHORA + 601_000)).toBe(0);
  });

  describe("al recibir otra cuota del mismo endpoint", () => {
    // La segunda respuesta puede pedir menos por haber pasado tiempo. Acortar
    // la espera vigente haria volver antes de tiempo.
    it("se queda con la mas larga", () => {
      const p: Pausas = {};
      pausar(p, "pistas", 600, AHORA);
      pausar(p, "pistas", 10, AHORA);
      expect(quedanSegundos(p, "pistas", AHORA)).toBe(600);
    });

    it("la alarga si la nueva llega mas lejos", () => {
      const p: Pausas = {};
      pausar(p, "pistas", 60, AHORA);
      pausar(p, "pistas", 900, AHORA);
      expect(quedanSegundos(p, "pistas", AHORA)).toBe(900);
    });
  });

  it("una espera negativa no deja el endpoint pausado", () => {
    const p: Pausas = {};
    pausar(p, "pistas", -5, AHORA);
    expect(enPausa(p, "pistas", AHORA)).toBe(false);
  });
});
