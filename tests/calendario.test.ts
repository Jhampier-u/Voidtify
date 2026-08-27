import { describe, it, expect } from "vitest";
import {
  construirCalendario,
  nivelDe,
  type Bucket,
  type Celda,
} from "@/lib/stats/calendario";

const dia = (date: string, plays = 1): Bucket => ({ date, plays, ms: plays * 200_000 });

const meses = (c: ReturnType<typeof construirCalendario>) => {
  if (c?.forma !== "meses") throw new Error("no es de meses");
  return c;
};
const tiras = (c: ReturnType<typeof construirCalendario>) => {
  if (c?.forma !== "tiras") throw new Error("no es de tiras");
  return c;
};

describe("nivelDe", () => {
  // El cero queda reservado a los dias sin musica: un dia con una sola escucha
  // tiene que verse, aunque el maximo del rango sea de doscientas.
  it("un dia con musica nunca es nivel cero", () => {
    expect(nivelDe(1, 200)).toBe(1);
  });

  it("el dia sin musica es cero", () => {
    expect(nivelDe(0, 200)).toBe(0);
  });

  it("el maximo llega al ultimo escalon", () => {
    expect(nivelDe(200, 200)).toBe(4);
  });

  it("reparte en cuatro escalones", () => {
    expect([nivelDe(50, 200), nivelDe(100, 200), nivelDe(150, 200)]).toEqual([1, 2, 3]);
  });

  // Un rango de un solo dia hace max = plays; dividir por cero daria NaN y el
  // color saldria de la nada.
  it("aguanta un maximo de cero", () => {
    expect(nivelDe(5, 0)).toBe(1);
    expect(nivelDe(0, 0)).toBe(0);
  });
});

describe("construirCalendario", () => {
  it("no devuelve nada sin datos", () => {
    expect(construirCalendario([], "2026-08-01", "2026-08-28")).toBeNull();
  });

  describe("el recorte del inicio", () => {
    // El preset «Historico» no tiene fecha de inicio: fromDate vale 1970-01-01
    // y dibujarlo literalmente daria cincuenta y seis tiras vacias.
    it("empieza en el primer dia con datos cuando el rango no tiene principio", () => {
      const c = tiras(
        construirCalendario([dia("2018-09-17"), dia("2026-08-01")], null, "2026-08-26"),
      );
      expect(c.anios.at(-1)!.anio).toBe(2018);
    });

    // Al reves seria peor: en cuatro semanas que empiezan en silencio, arrancar
    // en el primer dia con musica esconderia los huecos.
    it("no recorta el silencio del principio de un rango corto", () => {
      const c = meses(construirCalendario([dia("2026-08-20")], "2026-08-01", "2026-08-31"));
      const primera = c.meses[0].celdas.find((x): x is Celda => x !== null)!;
      expect(primera.diaDelMes).toBe(1);
      expect(primera.plays).toBe(0);
    });

    it("tampoco recorta el silencio del final", () => {
      const c = meses(construirCalendario([dia("2026-08-02")], "2026-08-01", "2026-08-31"));
      const ultima = c.meses[0].celdas.filter((x): x is Celda => x !== null).at(-1)!;
      expect(ultima.diaDelMes).toBe(31);
    });
  });

  it("no devuelve nada si el rango va al reves", () => {
    expect(construirCalendario([dia("2026-08-05")], "2026-08-28", "2026-08-01")).toBeNull();
  });

  describe("la forma", () => {
    it("son meses en un rango corto", () => {
      const c = construirCalendario([dia("2026-08-05")], "2026-08-01", "2026-08-28");
      expect(c?.forma).toBe("meses");
    });

    it("son meses justo en el limite de un año", () => {
      const c = construirCalendario([dia("2026-08-05")], "2026-01-01", "2027-01-01");
      // 366 dias exactos.
      expect(c?.forma).toBe("meses");
    });

    it("son tiras al pasar de un año", () => {
      const c = construirCalendario([dia("2020-08-05")], "2018-09-17", "2026-08-26");
      expect(c?.forma).toBe("tiras");
    });
  });

  describe("la densidad", () => {
    it("es rica en dos meses", () => {
      const c = meses(construirCalendario([dia("2026-08-05")], "2026-07-30", "2026-08-26"));
      expect(c.densidad).toBe("rica");
    });

    it("es compacta en seis meses", () => {
      const c = meses(construirCalendario([dia("2026-08-05")], "2026-03-01", "2026-08-28"));
      expect(c.densidad).toBe("compacta");
    });
  });

  describe("los meses", () => {
    // Un bloque que empieza en el dia 12 no se lee como agosto. El mes va
    // entero y lo que cae fuera del rango queda como hueco.
    it("se dibujan enteros aunque el rango empiece a mitad", () => {
      const c = meses(construirCalendario([dia("2026-08-20")], "2026-08-12", "2026-08-31"));
      expect(c.meses).toHaveLength(1);
      const conDatos = c.meses[0].celdas.filter((x): x is Celda => x !== null);
      expect(conDatos).toHaveLength(20); // del 12 al 31
      expect(conDatos[0].diaDelMes).toBe(12);
    });

    it("alinea el dia uno bajo su dia de la semana", () => {
      // 2026-08-01 es sabado: cinco huecos antes (lunes a viernes).
      const c = meses(construirCalendario([dia("2026-08-05")], "2026-08-01", "2026-08-31"));
      const celdas = c.meses[0].celdas;
      expect(celdas.slice(0, 5).every((x) => x === null)).toBe(true);
      expect((celdas[5] as Celda).diaDelMes).toBe(1);
    });

    it("cubre todos los meses que toca el rango, en orden", () => {
      const c = meses(construirCalendario([dia("2026-08-05")], "2026-06-15", "2026-09-02"));
      expect(c.meses.map((m) => m.clave)).toEqual([
        "2026-06", "2026-07", "2026-08", "2026-09",
      ]);
    });

    it("titula el mes con su nombre y su año", () => {
      const c = meses(construirCalendario([dia("2026-08-05")], "2026-08-01", "2026-08-31"));
      expect(c.meses[0].titulo).toBe("agosto 2026");
    });

    // Un dia del rango sin escuchas y un dia fuera del rango no pueden verse
    // igual: uno se consulto y salio vacio, el otro ni se pregunto.
    it("distingue un dia sin musica de uno fuera del rango", () => {
      const c = meses(construirCalendario([dia("2026-08-05")], "2026-08-04", "2026-08-06"));
      const celdas = c.meses[0].celdas;
      const del3 = celdas.find((x): x is Celda => x !== null && x.diaDelMes === 3);
      const del4 = celdas.find((x): x is Celda => x !== null && x.diaDelMes === 4);
      expect(del3).toBeUndefined();          // fuera del rango: hueco
      expect(del4).toMatchObject({ plays: 0, nivel: 0 }); // dentro, sin musica
    });

    it("lleva las escuchas y los minutos de cada dia", () => {
      const c = meses(construirCalendario([dia("2026-08-05", 42)], "2026-08-01", "2026-08-31"));
      const d5 = c.meses[0].celdas.find(
        (x): x is Celda => x !== null && x.diaDelMes === 5,
      );
      expect(d5).toMatchObject({ fecha: "2026-08-05", plays: 42, ms: 8_400_000, nivel: 4 });
    });

    // El nivel reparte en cinco cajones; la casilla grande dibuja la cifra
    // exacta, donde un cajon tiraria la diferencia entre un dia flojo y uno
    // normal.
    it("lleva ademas la proporcion exacta sobre el mejor dia", () => {
      const c = meses(
        construirCalendario(
          [dia("2026-08-05", 10), dia("2026-08-06", 40)],
          "2026-08-01",
          "2026-08-31",
        ),
      );
      const por = (d: number) =>
        c.meses[0].celdas.find((x): x is Celda => x !== null && x.diaDelMes === d)!;
      expect(por(5).ratio).toBeCloseTo(0.25);
      expect(por(6).ratio).toBe(1);
      expect(por(7).ratio).toBe(0);
    });
  });

  describe("las tiras", () => {
    const largo = construirCalendario([dia("2020-05-05"), dia("2026-01-02")], "2018-09-17", "2026-08-26");

    it("van de la mas reciente a la mas antigua", () => {
      expect(tiras(largo).anios.map((a) => a.anio)).toEqual([
        2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018,
      ]);
    });

    // Cada fila de la rejilla tiene que ser siempre el mismo dia de la semana,
    // asi que la tira arranca en el lunes de la primera semana.
    it("empiezan en lunes y son multiplo de siete", () => {
      for (const a of tiras(largo).anios) {
        expect(a.celdas.length).toBe(a.semanas * 7);
      }
    });

    it("dejan como hueco lo anterior al inicio del rango", () => {
      // 2018-09-17 es lunes, asi que ese año no lleva hueco inicial...
      const a2018 = tiras(largo).anios.at(-1)!;
      expect(a2018.celdas[0]).not.toBeNull();
      // ...pero si al final, hasta completar la ultima semana de diciembre.
      expect(a2018.celdas.at(-1)).toBeNull();
    });

    it("recortan el ultimo año por el final del rango", () => {
      const a2026 = tiras(largo).anios[0];
      const ultima = a2026.celdas.filter((x): x is Celda => x !== null).at(-1)!;
      expect(ultima.fecha).toBe("2026-08-26");
    });
  });
});
