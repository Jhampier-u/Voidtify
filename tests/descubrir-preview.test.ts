import { describe, it, expect } from "vitest";
import { elegirPreview, type Candidata } from "@/lib/descubrir/preview";

const c = (artista: string, titulo: string, preview: string | null = "u"): Candidata => ({
  artista,
  titulo,
  preview,
});

const BUSCADO = { artista: "Slowdive", titulo: "Alison" };

describe("elegirPreview", () => {
  it("no elige nada sin candidatas", () => {
    expect(elegirPreview(BUSCADO, [])).toBeNull();
  });

  it("descarta las que no traen fragmento", () => {
    expect(elegirPreview(BUSCADO, [c("Slowdive", "Alison", null)])).toBeNull();
    expect(elegirPreview(BUSCADO, [c("Slowdive", "Alison", "  ")])).toBeNull();
  });

  it("elige la del mismo artista y titulo", () => {
    expect(elegirPreview(BUSCADO, [c("Slowdive", "Alison", "buena")])).toBe("buena");
  });

  // El caso real: buscando «Filtro Suerte» en iTunes, el segundo resultado es
  // «Los Tucanes de Tijuana — El Sierra». Sin comprobar el artista sonaria eso.
  describe("cuando el artista no coincide", () => {
    it("no la elige aunque tenga fragmento", () => {
      expect(
        elegirPreview({ artista: "Filtro", titulo: "Suerte" }, [
          c("Los Tucanes de Tijuana", "El Sierra", "mala"),
        ]),
      ).toBeNull();
    });

    it("se salta las ajenas y se queda con la del artista", () => {
      const r = elegirPreview(BUSCADO, [
        c("Otra Banda", "Alison", "mala"),
        c("Slowdive", "Alison", "buena"),
      ]);
      expect(r).toBe("buena");
    });
  });

  describe("las colaboraciones", () => {
    // iTunes junta los creditos en una cadena: buscar el artista entero
    // fallaria en todas.
    it("valen si el artista aparece entre los creditos", () => {
      for (const credito of [
        "Joel Elizalde & La Bohemia Vip, Slowdive",
        "Slowdive feat. Alguien",
        "Alguien con Slowdive",
      ]) {
        expect(elegirPreview(BUSCADO, [c(credito, "Alison", "buena")])).toBe("buena");
      }
    });

    it("no valen si solo se parecen de lejos", () => {
      expect(elegirPreview(BUSCADO, [c("Slowdive Tribute Band", "Alison")])).toBeNull();
    });
  });

  describe("el titulo", () => {
    it("prefiere el exacto sobre otra version del mismo artista", () => {
      const r = elegirPreview(BUSCADO, [
        c("Slowdive", "Alison - Live at Somewhere", "directo"),
        c("Slowdive", "Alison", "estudio"),
      ]);
      expect(r).toBe("estudio");
    });

    // Suele ser una remasterizacion o una edicion distinta, y para escuchar
    // treinta segundos vale igual.
    it("acepta otra versión si no hay exacta", () => {
      const r = elegirPreview(BUSCADO, [c("Slowdive", "Alison (2023 Mix)", "mix")]);
      expect(r).toBe("mix");
    });

    it("no se despista por acentos ni mayúsculas", () => {
      expect(
        elegirPreview({ artista: "Björk", titulo: "Jóga" }, [
          c("BJORK", "JOGA", "buena"),
        ]),
      ).toBe("buena");
    });
  });

  it("recorta la url", () => {
    expect(elegirPreview(BUSCADO, [c("Slowdive", "Alison", "  u  ")])).toBe("u");
  });
});
