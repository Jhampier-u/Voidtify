import { describe, it, expect } from "vitest";
import { construirEvolucion, type Toma } from "@/lib/stats/evolucion-spotify";
import { normalizeName } from "@/lib/stats/normalize";

const toma = (takenAt: number, nombres: string[]): Toma => ({ takenAt, nombres });
const construir = (tomas: Toma[], profundidad = 3) =>
  construirEvolucion(tomas, profundidad, normalizeName);

describe("construirEvolucion", () => {
  it("no devuelve nada sin tomas", () => {
    expect(construir([])).toEqual({ tomas: [], series: [], salen: [] });
  });

  it("sigue solo a los del top de la última toma", () => {
    const e = construir([
      toma(1, ["A", "B", "C", "D"]),
      toma(2, ["B", "C", "D", "A"]),
    ]);
    expect(e.series.map((s) => s.nombre)).toEqual(["B", "C", "D"]);
  });

  it("recoge el puesto en cada toma", () => {
    const e = construir([
      toma(1, ["A", "B"]),
      toma(2, ["B", "A"]),
      toma(3, ["B", "A"]),
    ]);
    expect(e.series[0]).toMatchObject({
      nombre: "B",
      posiciones: [2, 1, 1],
      actual: 1,
    });
  });

  describe("el movimiento", () => {
    // Positivo sube: bajar de puesto es mejorar.
    it("es positivo al subir de puesto", () => {
      const e = construir([toma(1, ["A", "B"]), toma(2, ["B", "A"])]);
      expect(e.series.find((s) => s.nombre === "B")!.delta).toBe(1);
      expect(e.series.find((s) => s.nombre === "A")!.delta).toBe(-1);
    });

    it("es null para quien no estaba", () => {
      const e = construir([toma(1, ["A"]), toma(2, ["Nuevo", "A"])]);
      expect(e.series.find((s) => s.nombre === "Nuevo")!.delta).toBeNull();
    });

    it("es null con una sola toma", () => {
      expect(construir([toma(1, ["A"])]).series[0].delta).toBeNull();
    });
  });

  describe("los huecos", () => {
    // Null no es cero. Unir los puntos por encima de un hueco dibujaria una
    // caida y una recuperacion que nadie vivio.
    it("se marcan como null y no como el último puesto", () => {
      const e = construir([
        toma(1, ["A"]),
        toma(2, ["Otro"]),
        toma(3, ["A"]),
      ]);
      expect(e.series[0].posiciones).toEqual([1, null, 1]);
    });
  });

  // Un top de tres se sigue en la lista entera: una caida del tres al
  // veintisiete debe verse como una caida, no como una desaparicion.
  it("mira el puesto en la lista completa, no solo en el top", () => {
    const larga = ["X", "Y", "Z", "W", "A"];
    const e = construir([toma(1, ["A", "B", "C"]), toma(2, larga)]);
    const a = e.series.find((s) => s.nombre === "X");
    expect(a).toBeDefined();
    // «A» ya no esta en el top 3 de la ultima, asi que no se sigue.
    expect(e.series.map((s) => s.nombre)).toEqual(["X", "Y", "Z"]);
  });

  describe("quién sale", () => {
    it("son los del top anterior que ya no están", () => {
      const e = construir([
        toma(1, ["A", "B", "C"]),
        toma(2, ["A", "B", "Nuevo"]),
      ]);
      expect(e.salen).toEqual(["C"]);
    });

    it("está vacío si no se movió nadie", () => {
      const e = construir([toma(1, ["A", "B"]), toma(2, ["B", "A"])]);
      expect(e.salen).toEqual([]);
    });

    it("está vacío con una sola toma", () => {
      expect(construir([toma(1, ["A"])]).salen).toEqual([]);
    });
  });

  // Las tomas guardan el nombre tal como lo devolvio Spotify, y puede variar
  // entre una y otra: sin normalizar, «Sigur Ros» y «Sigur Rós» serian dos.
  it("compara los nombres normalizados", () => {
    const e = construir([toma(1, ["Sigur Rós"]), toma(2, ["Sigur Ros"])]);
    expect(e.series[0].posiciones).toEqual([1, 1]);
  });

  it("devuelve las fechas de las tomas en orden", () => {
    expect(construir([toma(10, ["A"]), toma(20, ["A"])]).tomas).toEqual([10, 20]);
  });
});
