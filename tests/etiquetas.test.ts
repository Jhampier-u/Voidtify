import { describe, it, expect } from "vitest";
import { clasificar, normalizarEtiqueta, porEje } from "@/lib/stats/etiquetas";

describe("normalizarEtiqueta", () => {
  it("baja a minusculas y recorta", () => {
    expect(normalizarEtiqueta("  Dream Pop  ")).toBe("dream pop");
  });

  it("colapsa los espacios de dentro", () => {
    expect(normalizarEtiqueta("post   punk")).toBe("post punk");
  });
});

describe("clasificar", () => {
  describe("epoca", () => {
    it("reconoce las decadas en cifras", () => {
      for (const t of ["80s", "70s", "60s", "90s", "50s", "00s"]) {
        expect(clasificar(t)).toBe("epoca");
      }
    });

    it("reconoce la decada con el siglo delante", () => {
      expect(clasificar("1980s")).toBe("epoca");
      expect(clasificar("2000s")).toBe("epoca");
    });

    it("reconoce las de palabra", () => {
      expect(clasificar("oldies")).toBe("epoca");
    });

    // «80s pop» dice como suena, no solo cuando se hizo.
    it("no se lleva las que ademas dicen el genero", () => {
      expect(clasificar("80s pop")).toBe("genero");
    });
  });

  describe("procedencia", () => {
    it("reconoce el gentilicio a secas", () => {
      for (const t of ["british", "japanese", "usa", "argentina", "spanish"]) {
        expect(clasificar(t)).toBe("procedencia");
      }
    });

    // El caso que hace falta acertar: llevan un origen dentro y son generos.
    it("no se lleva las que combinan origen y genero", () => {
      for (const t of ["rock argentino", "j-pop", "latin pop", "rock en espanol", "j-rock"]) {
        expect(clasificar(t)).toBe("genero");
      }
    });

    it("aguanta las tildes", () => {
      expect(clasificar("España")).toBe("procedencia");
    });
  });

  describe("voz", () => {
    it("reconoce el tipo de voz", () => {
      expect(clasificar("female vocalists")).toBe("voz");
      expect(clasificar("Male Vocalist")).toBe("voz");
    });

    // «vocal jazz» es un genero: dice como suena la musica, no quien canta.
    it("no se lleva los generos que llevan la palabra vocal", () => {
      expect(clasificar("vocal jazz")).toBe("genero");
      expect(clasificar("jazz vocal")).toBe("genero");
    });
  });

  describe("otros", () => {
    it("reconoce las notas de quien etiqueto", () => {
      expect(clasificar("my top songs")).toBe("otros");
      expect(clasificar("seen live")).toBe("otros");
    });

    it("una etiqueta vacia no es un genero", () => {
      expect(clasificar("   ")).toBe("otros");
    });
  });

  // Ante la duda se queda como genero: dejar una dudosa ensucia un puesto,
  // sacar una de verdad borra informacion sin avisar.
  describe("todo lo demas es genero", () => {
    it("incluye los generos raros y los compuestos", () => {
      for (const t of [
        "shoegaze", "slowcore", "coldwave", "video game music",
        "singer-songwriter", "instrumental", "soundtrack", "anime",
      ]) {
        expect(clasificar(t)).toBe("genero");
      }
    });
  });
});

describe("porEje", () => {
  it("reparte y conserva el orden de cada eje", () => {
    const r = porEje(["shoegaze", "80s", "british", "female vocalists", "dream pop"]);
    expect(r.genero).toEqual(["shoegaze", "dream pop"]);
    expect(r.epoca).toEqual(["80s"]);
    expect(r.procedencia).toEqual(["british"]);
    expect(r.voz).toEqual(["female vocalists"]);
  });

  // Last.fm las devuelve de mas a menos usada y el reparto se queda con las
  // primeras de cada artista: un duplicado inflaria su peso sin delatarse.
  it("no repite una etiqueta que llega dos veces escrita distinto", () => {
    expect(porEje(["Shoegaze", "shoegaze", " SHOEGAZE "]).genero).toEqual(["shoegaze"]);
  });

  it("descarta las vacias", () => {
    expect(porEje(["", "  ", "jazz"]).genero).toEqual(["jazz"]);
  });

  it("devuelve los cinco ejes aunque esten vacios", () => {
    expect(Object.keys(porEje([])).sort()).toEqual([
      "epoca", "genero", "otros", "procedencia", "voz",
    ]);
  });
});
