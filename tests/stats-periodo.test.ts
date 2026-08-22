import { describe, it, expect } from "vitest";
import {
  etiqueta,
  anterior,
  compararRanking,
  limites,
  lunesDe,
  periodoDe,
  type EntradaRanking,
} from "@/lib/stats/periodo";

describe("lunesDe", () => {
  it("devuelve el lunes de esa semana", () => {
    expect(lunesDe("2026-08-05")).toBe("2026-08-03"); // miércoles
    expect(lunesDe("2026-08-03")).toBe("2026-08-03"); // el propio lunes
  });

  // El domingo pertenece a la semana que empezó el lunes anterior, no a la que
  // empieza al día siguiente. Con la convención de Estados Unidos saldría lo
  // contrario y una semana entera aparecería partida.
  it("mete el domingo en la semana que ya iba", () => {
    expect(lunesDe("2026-08-09")).toBe("2026-08-03");
  });

  it("cruza el cambio de mes y de año", () => {
    expect(lunesDe("2026-01-01")).toBe("2025-12-29");
  });
});

describe("periodoDe", () => {
  it("resume la fecha según el tipo", () => {
    expect(periodoDe("2026-08-05", "semana")).toBe("2026-08-03");
    expect(periodoDe("2026-08-05", "mes")).toBe("2026-08");
    expect(periodoDe("2026-08-05", "anio")).toBe("2026");
  });
});

describe("anterior", () => {
  it("retrocede una semana", () => {
    expect(anterior("2026-08-03", "semana")).toBe("2026-07-27");
  });

  it("retrocede un mes", () => {
    expect(anterior("2026-08", "mes")).toBe("2026-07");
  });

  // Sin tratar enero aparte saldría el mes 0, que no existe.
  it("de enero retrocede a diciembre del año anterior", () => {
    expect(anterior("2026-01", "mes")).toBe("2025-12");
  });

  it("retrocede un año", () => {
    expect(anterior("2026", "anio")).toBe("2025");
  });
});

describe("limites", () => {
  it("acota la semana de lunes a domingo", () => {
    expect(limites("2026-08-03", "semana")).toEqual({
      desde: "2026-08-03",
      hasta: "2026-08-09",
    });
  });

  it("acota el año entero", () => {
    expect(limites("2026", "anio")).toEqual({
      desde: "2026-01-01",
      hasta: "2026-12-31",
    });
  });

  describe("meses de distinta longitud", () => {
    it("acierta con uno de 31 y otro de 30", () => {
      expect(limites("2026-08", "mes").hasta).toBe("2026-08-31");
      expect(limites("2026-04", "mes").hasta).toBe("2026-04-30");
    });

    // Febrero es donde se rompe cualquier tabla fija de días por mes.
    it("acierta con febrero, bisiesto y no", () => {
      expect(limites("2026-02", "mes").hasta).toBe("2026-02-28");
      expect(limites("2028-02", "mes").hasta).toBe("2028-02-29");
    });
  });
});

describe("compararRanking", () => {
  const e = (key: string, plays: number): EntradaRanking => ({
    key,
    name: key,
    plays,
  });

  it("marca lo que no estaba como nuevo", () => {
    const c = compararRanking([e("a", 10)], []);
    expect(c.filas[0].movimiento).toBe("nuevo");
    expect(c.filas[0].delta).toBeNull();
    expect(c.filas[0].playsAnterior).toBeNull();
  });

  it("calcula cuántos puestos sube o baja", () => {
    const c = compararRanking(
      [e("b", 10), e("a", 5)],
      [e("a", 20), e("b", 3)],
    );
    expect(c.filas[0]).toMatchObject({ key: "b", delta: 1, movimiento: "sube" });
    expect(c.filas[1]).toMatchObject({ key: "a", delta: -1, movimiento: "baja" });
  });

  it("marca igual cuando no se mueve", () => {
    const c = compararRanking([e("a", 10)], [e("a", 4)]);
    expect(c.filas[0].movimiento).toBe("igual");
    expect(c.filas[0].delta).toBe(0);
    expect(c.filas[0].playsAnterior).toBe(4);
  });

  it("recoge lo que desaparece del ranking", () => {
    const c = compararRanking([e("a", 10)], [e("a", 9), e("z", 8)]);
    expect(c.salen).toEqual([
      { key: "z", name: "z", plays: 8, posicionAnterior: 2 },
    ]);
  });

  it("no inventa salidas cuando todo sigue", () => {
    expect(compararRanking([e("a", 1)], [e("a", 1)]).salen).toEqual([]);
  });

  it("aguanta dos periodos sin nada", () => {
    expect(compararRanking([], [])).toEqual({ filas: [], salen: [] });
  });
});

describe("etiqueta", () => {
  it("nombra el año tal cual", () => {
    expect(etiqueta("2026", "anio")).toBe("2026");
  });

  // Construir una fecha desde "YYYY-MM" y formatearla con la zona del proceso
  // desplaza el día uno al mes anterior en cualquier zona al oeste de
  // Greenwich, que es la del usuario. Agosto saldría como julio.
  it("nombra el mes sin desfase de zona horaria", () => {
    expect(etiqueta("2026-08", "mes")).toBe("agosto de 2026");
    expect(etiqueta("2026-01", "mes")).toBe("enero de 2026");
    expect(etiqueta("2026-12", "mes")).toBe("diciembre de 2026");
  });

  it("nombra la semana por su lunes", () => {
    expect(etiqueta("2026-08-03", "semana")).toBe("semana del 3 de agosto de 2026");
  });
});
