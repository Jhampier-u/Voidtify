import { describe, it, expect } from "vitest";
import {
  construirVidaDeGeneros,
  dormidos,
  inicioDeVentana,
  type VidaArtista,
} from "@/lib/stats/vida-generos";

describe("inicioDeVentana", () => {
  it("resta dias de calendario", () => {
    expect(inicioDeVentana("2026-08-26", 90)).toBe("2026-05-28");
  });

  it("cruza el cambio de año", () => {
    expect(inicioDeVentana("2026-01-05", 10)).toBe("2025-12-26");
  });

  it("con cero dias devuelve el mismo dia", () => {
    expect(inicioDeVentana("2026-08-26", 0)).toBe("2026-08-26");
  });
});

const artista = (
  key: string,
  primera: string,
  ultima: string,
  total = 100,
  recientes = 0,
): VidaArtista => ({ key, primera, ultima, total, recientes });

const mapa = (o: Record<string, string[]>) => new Map(Object.entries(o));

describe("construirVidaDeGeneros", () => {
  it("no inventa géneros para artistas sin etiquetas", () => {
    expect(
      construirVidaDeGeneros([artista("a", "2020-01-01", "2020-02-01")], mapa({}))
        .size,
    ).toBe(0);
  });

  // Un genero entra en tu vida el dia que suena el primero de sus artistas y
  // sigue vivo mientras suene cualquiera de ellos.
  it("hereda las fechas extremas de sus artistas", () => {
    const v = construirVidaDeGeneros(
      [
        artista("viejo", "2019-03-27", "2021-01-01"),
        artista("nuevo", "2023-06-15", "2026-08-20"),
      ],
      mapa({ viejo: ["shoegaze"], nuevo: ["shoegaze"] }),
    );
    expect(v.get("shoegaze")).toMatchObject({
      primera: "2019-03-27",
      ultima: "2026-08-20",
    });
  });

  it("suma los totales y lo reciente", () => {
    const v = construirVidaDeGeneros(
      [
        artista("a", "2020-01-01", "2026-01-01", 30, 5),
        artista("b", "2021-01-01", "2026-01-01", 70, 0),
      ],
      mapa({ a: ["indie"], b: ["indie"] }),
    );
    expect(v.get("indie")).toMatchObject({ total: 100, recientes: 5 });
  });

  it("solo cuenta las primeras etiquetas de cada artista", () => {
    const v = construirVidaDeGeneros(
      [artista("a", "2020-01-01", "2020-02-01")],
      mapa({ a: ["indie", "punk", "jazz", "folk"] }),
      3,
    );
    expect([...v.keys()]).toEqual(["indie", "punk", "jazz"]);
  });

  it("no toma por género una década ni un país", () => {
    const v = construirVidaDeGeneros(
      [artista("a", "2020-01-01", "2020-02-01")],
      mapa({ a: ["80s", "british", "indie"] }),
    );
    expect([...v.keys()]).toEqual(["indie"]);
  });
});

describe("dormidos", () => {
  const vida = (
    entradas: [string, string, number, number][],
  ) =>
    new Map(
      entradas.map(([name, ultima, total, recientes]) => [
        name,
        { name, primera: "2018-01-01", ultima, total, recientes },
      ]),
    );

  it("son los que no han sonado en la ventana reciente", () => {
    const d = dormidos(vida([
      ["vivo", "2026-08-20", 500, 40],
      ["dormido", "2026-01-14", 500, 0],
    ]));
    expect(d.map((x) => x.name)).toEqual(["dormido"]);
  });

  // Un genero con cuatro escuchas de por vida no estaba «dormido»: es que
  // nunca estuvo despierto, y llenaria la lista de ruido.
  it("descarta los que apenas escuchaste", () => {
    expect(dormidos(vida([["marginal", "2020-01-01", 4, 0]]))).toEqual([]);
  });

  // Lo que dejaste hace tres meses se reconoce y sorprende; lo de hace cuatro
  // años ya no es una ausencia, es otra epoca.
  it("pone primero lo abandonado más recientemente", () => {
    const d = dormidos(vida([
      ["antiguo", "2022-03-01", 500, 0],
      ["reciente", "2026-05-26", 500, 0],
      ["medio", "2025-01-01", 500, 0],
    ]));
    expect(d.map((x) => x.name)).toEqual(["reciente", "medio", "antiguo"]);
  });

  it("respeta el límite", () => {
    const d = dormidos(
      vida([
        ["a", "2026-01-01", 500, 0],
        ["b", "2025-01-01", 500, 0],
        ["c", "2024-01-01", 500, 0],
      ]),
      2,
    );
    expect(d).toHaveLength(2);
  });
});
