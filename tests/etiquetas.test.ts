import { describe, it, expect } from "vitest";
import {
  claveEtiqueta,
  clasificar,
  crearCanon,
  normalizarEtiqueta,
  porEje,
} from "@/lib/stats/etiquetas";

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

    // Salen igual de la pregunta «de donde viene», y «asian» aparecia entre
    // los generos dormidos con 291 escuchas.
    it("reconoce también las regiones", () => {
      for (const t of ["asian", "european", "scandinavian"]) {
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

describe("claveEtiqueta", () => {
  // `hip-hop` y `hip hop` sumaban 142 y 78 por separado como si fueran dos
  // generos; peor aun, `lo-fi` salia entre lo mas escuchado y `lo fi` entre lo
  // que llevabas meses sin tocar.
  it("junta las variantes con guion, con espacio y pegadas", () => {
    const k = claveEtiqueta("lo-fi");
    expect(claveEtiqueta("lo fi")).toBe(k);
    expect(claveEtiqueta("LoFi")).toBe(k);
    expect(claveEtiqueta("  Lo - Fi ")).toBe(k);
  });

  it("no junta cosas distintas", () => {
    expect(claveEtiqueta("post-punk")).not.toBe(claveEtiqueta("post-rock"));
  });

  // Quitar el ampersand juntaria `r&b` con `rb` sin acercarlo a `rnb`, que es
  // lo que haria falta.
  it("deja en paz el ampersand", () => {
    expect(claveEtiqueta("r&b")).not.toBe(claveEtiqueta("rnb"));
  });
});

describe("clasificar por clave", () => {
  it("un eje no se escapa por como este escrita la etiqueta", () => {
    expect(clasificar("female-vocalists")).toBe("voz");
    expect(clasificar("newzealand")).toBe("procedencia");
  });
});

describe("crearCanon", () => {
  const canon = (corpus: string[][]) => crearCanon(corpus);

  it("enseña la ortografía más frecuente del grupo", () => {
    const c = canon([["lo-fi"], ["lo-fi"], ["lo fi"], ["lofi"]]);
    expect(c.nombre(c.clave("lofi"))).toBe("lo-fi");
  });

  // Sin desempate fijo, dos variantes empatadas se turnarian entre recargas y
  // la lista pareceria cambiar sola.
  it("desempata siempre igual", () => {
    const c1 = canon([["lo fi"], ["lo-fi"]]);
    const c2 = canon([["lo-fi"], ["lo fi"]]);
    expect(c1.nombre("lofi")).toBe(c2.nombre("lofi"));
  });

  it("devuelve la clave tal cual si no la conoce", () => {
    expect(canon([]).nombre("desconocido")).toBe("desconocido");
  });

  it("ignora las etiquetas vacías", () => {
    const c = canon([["", "  ", "jazz"]]);
    expect(c.nombre("jazz")).toBe("jazz");
  });
});

describe("porEje", () => {
  it("reparte y conserva el orden de cada eje", () => {
    const r = porEje(["shoegaze", "80s", "british", "female vocalists", "dream pop"]);
    expect(r.genero).toEqual(["shoegaze", "dreampop"]);
    expect(r.epoca).toEqual(["80s"]);
    expect(r.procedencia).toEqual(["british"]);
    expect(r.voz).toEqual(["femalevocalists"]);
  });

  it("devuelve claves, no la ortografía original", () => {
    expect(porEje(["Dream Pop"]).genero).toEqual(["dreampop"]);
  });

  // Un artista con «lo-fi» y «lofi» inflaria su peso al contarse dos veces.
  it("no repite una etiqueta que llega en dos ortografías", () => {
    expect(porEje(["lo-fi", "lo fi", "LOFI"]).genero).toEqual(["lofi"]);
  });

  it("descarta las vacias", () => {
    expect(porEje(["", "  ", "jazz"]).genero).toEqual(["jazz"]);
  });

  it("devuelve los cinco ejes aunque estén vacíos", () => {
    expect(Object.keys(porEje([])).sort()).toEqual([
      "epoca", "genero", "otros", "procedencia", "voz",
    ]);
  });
});
