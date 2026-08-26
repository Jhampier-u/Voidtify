import { describe, it, expect } from "vitest";
import { duracion } from "@/lib/formato";

const MIN = 60_000;

describe("duracion", () => {
  it("da minutos cuando son pocos", () => {
    expect(duracion(52 * MIN)).toBe("52 min");
  });

  // El caso que motivó todo esto: en la lista de tops se leía «237M», y junto a
  // 52 reproducciones eso son doscientos treinta y siete millones. La unidad va
  // entera para que el `uppercase` del sistema no pueda cambiarle el sentido.
  it("nunca abrevia la unidad a una sola letra", () => {
    for (const ms of [1 * MIN, 52 * MIN, 89 * MIN, 237 * MIN, 5000 * MIN]) {
      expect(duracion(ms)).not.toMatch(/\d\s*m$/);
    }
  });

  it("pasa a horas a partir de hora y media", () => {
    expect(duracion(89 * MIN)).toBe("89 min");
    expect(duracion(90 * MIN)).toBe("1 h 30");
    expect(duracion(237 * MIN)).toBe("3 h 57");
  });

  it("rellena los minutos a dos cifras", () => {
    expect(duracion(125 * MIN)).toBe("2 h 05");
  });

  // En español los números de cuatro cifras van sin separador de millares
  // («1666»), y a partir de cinco lo llevan («10.000»). Es regla de CLDR, no un
  // capricho del formateador: escribirlo a mano se equivocaría en un lado o en
  // el otro.
  it("agrupa los millares según la regla española", () => {
    expect(duracion(5314 * MIN)).toBe("88 h 34");
    expect(duracion(100_000 * MIN)).toBe("1666 h 40");
    expect(duracion(600_000 * MIN)).toBe("10.000 h 00");
  });

  describe("casos límite", () => {
    it("acepta cero", () => {
      expect(duracion(0)).toBe("0 min");
    });

    // Una duración negativa solo puede venir de un dato corrupto. Mostrar
    // «-3 min» daría a entender que la cifra es fiable y solo rara.
    it("no muestra duraciones negativas", () => {
      expect(duracion(-5000)).toBe("0 min");
    });

    it("redondea los segundos sueltos", () => {
      expect(duracion(89_000)).toBe("1 min");
      expect(duracion(29_000)).toBe("0 min");
    });
  });
});
