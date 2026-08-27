import { describe, it, expect } from "vitest";
import { mezclar, type Rama, type SimilarEntrada } from "@/lib/descubrir/mezcla";
import { artistKey, trackKey } from "@/lib/stats/normalize";

const SIN_NADA = new Set<string>();

function e(artista: string, titulo: string, match: number): SimilarEntrada {
  return { artista, titulo, match };
}

/** Una rama de la mezcla. El origen solo importa donde se comprueba. */
const rama = (entradas: SimilarEntrada[], origen = "semilla"): Rama => ({
  origen,
  entradas,
});

describe("mezclar", () => {
  it("devuelve vacío cuando no hay sugerencias", () => {
    expect(mezclar([], SIN_NADA, SIN_NADA, 10)).toEqual([]);
  });

  it("suma el parecido de las semillas que coinciden", () => {
    const r = mezclar(
      [rama([e("Ride", "Vapour Trail", 0.6)]), rama([e("Ride", "Vapour Trail", 0.3)])],
      SIN_NADA,
      SIN_NADA,
      10,
    );
    expect(r).toHaveLength(1);
    expect(r[0].puntos).toBeCloseTo(0.9);
    expect(r[0].semillas).toBe(2);
  });

  // Aparecer cerca de varias canciones que ya te gustan es mejor señal que
  // parecerse mucho a una sola.
  it("pone por delante lo que traen varias semillas", () => {
    const r = mezclar(
      [
        rama([e("Ride", "Vapour Trail", 0.5), e("Lush", "De-Luxe", 0.9)]),
        rama([e("Ride", "Vapour Trail", 0.5)]),
      ],
      SIN_NADA,
      SIN_NADA,
      10,
    );
    expect(r[0].titulo).toBe("Vapour Trail");
    expect(r[1].titulo).toBe("De-Luxe");
  });

  it("no cuenta dos veces una canción repetida dentro de la misma semilla", () => {
    const r = mezclar(
      [rama([e("Ride", "Vapour Trail", 0.5), e("Ride", "Vapour Trail", 0.5)])],
      SIN_NADA,
      SIN_NADA,
      10,
    );
    expect(r[0].semillas).toBe(1);
    expect(r[0].puntos).toBeCloseTo(0.5);
  });

  describe("lo ya escuchado", () => {
    it("se descarta", () => {
      const conocidas = new Set([trackKey("Ride", "Vapour Trail")]);
      const r = mezclar(
        [rama([e("Ride", "Vapour Trail", 0.9), e("Lush", "De-Luxe", 0.4)])],
        conocidas,
        SIN_NADA,
        10,
      );
      expect(r.map((c) => c.titulo)).toEqual(["De-Luxe"]);
    });

    // La clave normaliza acentos y mayúsculas: si no, "Björk" y "Bjork"
    // pasarían por artistas distintos y colarían canciones ya escuchadas.
    it("se descarta aunque venga con otra grafía", () => {
      const conocidas = new Set([trackKey("Björk", "Jóga")]);
      const r = mezclar([rama([e("BJORK", "Joga", 0.9)])], conocidas, SIN_NADA, 10);
      expect(r).toEqual([]);
    });
  });

  it("marca si el artista ya te suena", () => {
    const artistas = new Set([artistKey("Ride")]);
    const r = mezclar(
      [rama([e("Ride", "Vapour Trail", 0.5), e("Lush", "De-Luxe", 0.4)])],
      SIN_NADA,
      artistas,
      10,
    );
    expect(r.find((c) => c.artista === "Ride")!.artistaConocido).toBe(true);
    expect(r.find((c) => c.artista === "Lush")!.artistaConocido).toBe(false);
  });

  describe("entradas defectuosas", () => {
    it("ignora artista o título vacíos", () => {
      const r = mezclar(
        [rama([e("", "Vapour Trail", 0.5), e("Ride", "   ", 0.5)])],
        SIN_NADA,
        SIN_NADA,
        10,
      );
      expect(r).toEqual([]);
    });

    // Last.fm devuelve el parecido como cadena; si el sitio de llamada usa
    // parseFloat sobre algo raro, aquí llega NaN. Sumarlo envenenaría la
    // puntuación y el candidato quedaría fuera de todo orden.
    it("ignora un parecido que no es número", () => {
      const r = mezclar(
        [rama([e("Ride", "Vapour Trail", NaN), e("Lush", "De-Luxe", 0.4)])],
        SIN_NADA,
        SIN_NADA,
        10,
      );
      expect(r.map((c) => c.artista)).toEqual(["Lush"]);
    });
  });

  it("respeta el límite", () => {
    const lista = Array.from({ length: 50 }, (_, i) =>
      e("Artista", `Tema ${i}`, i / 100),
    );
    expect(mezclar([rama(lista)], SIN_NADA, SIN_NADA, 5)).toHaveLength(5);
  });

  // Sin desempate explícito el orden dependería del recorrido del Map y la
  // lista cambiaría entre recargas con los mismos datos.
  it("ordena igual ante empates, ejecución tras ejecución", () => {
    const entradas = [
      e("Zeta", "Uno", 0.5),
      e("Alfa", "Dos", 0.5),
      e("Media", "Tres", 0.5),
    ];
    const primera = mezclar([rama(entradas)], SIN_NADA, SIN_NADA, 10);
    const segunda = mezclar(
      [rama([...entradas].reverse())],
      SIN_NADA,
      SIN_NADA,
      10,
    );
    expect(primera.map((c) => c.clave)).toEqual(segunda.map((c) => c.clave));
  });

  // Sin esto la lista es un monton de nombres: quien mira no puede juzgar si
  // la sugerencia tiene sentido.
  describe("de donde salio cada una", () => {
    it("lo guarda", () => {
      const r = mezclar(
        [rama([e("Ride", "Vapour Trail", 0.9)], "Duster")],
        SIN_NADA,
        SIN_NADA,
        10,
      );
      expect(r[0].desde).toBe("Duster");
    });

    // Con doce semillas, la primera que lo trae es casi siempre la del
    // recorrido y no la que lo explica.
    it("se queda con la semilla a la que mas se parece, no con la primera", () => {
      const r = mezclar(
        [
          rama([e("Ride", "Vapour Trail", 0.2)], "floja"),
          rama([e("Ride", "Vapour Trail", 0.9)], "fuerte"),
        ],
        SIN_NADA,
        SIN_NADA,
        10,
      );
      expect(r[0].desde).toBe("fuerte");
    });

    it("no cambia de semilla si la nueva se parece menos", () => {
      const r = mezclar(
        [
          rama([e("Ride", "Vapour Trail", 0.9)], "fuerte"),
          rama([e("Ride", "Vapour Trail", 0.2)], "floja"),
        ],
        SIN_NADA,
        SIN_NADA,
        10,
      );
      expect(r[0].desde).toBe("fuerte");
    });
  });
});
