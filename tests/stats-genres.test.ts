import { describe, expect, it } from "vitest";
import {
  getGenreBreakdown,
  getArtistasSinGeneros,
  guardarGeneros,
} from "@/lib/stats/genres";
import type { StatsRange } from "@/lib/stats/range";
import { createTestDb } from "./helpers/test-db";
import { seedStreams, stream } from "./helpers/seed-streams";

const HISTORICO: StatsRange = {
  fromDate: "1970-01-01",
  toDate: "2099-12-31",
  label: "Histórico",
  preset: "all",
};

const d = "2026-03-10";

/** Siembra n escuchas de un artista. */
function escuchas(artista: string, n: number) {
  return Array.from({ length: n }, () =>
    stream({ localDate: d, artistName: artista }),
  );
}

describe("guardarGeneros", () => {
  it("guarda y recupera los géneros de un artista", async () => {
    const { db } = createTestDb();
    await guardarGeneros(db, "duster", ["slowcore", "indie rock"]);

    const { generos } = await getGenreBreakdown(db, HISTORICO);
    expect(generos).toEqual([]); // sin escuchas, no hay nada que ponderar
  });

  it("sobrescribe si se vuelve a guardar", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, escuchas("Duster", 3));

    await guardarGeneros(db, "duster", ["viejo"]);
    await guardarGeneros(db, "duster", ["nuevo"]);

    const { generos } = await getGenreBreakdown(db, HISTORICO);
    expect(generos.map((g) => g.name)).toEqual(["nuevo"]);
  });

  it("acepta una lista vacía, para no reintentar eternamente", async () => {
    // Un artista que Last.fm no conoce debe quedar cacheado igualmente.
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, escuchas("Desconocido", 2));

    await guardarGeneros(db, "desconocido", []);

    expect(await getArtistasSinGeneros(db, HISTORICO)).toEqual([]);
  });
});

describe("getArtistasSinGeneros", () => {
  it("devuelve vacío cuando no hay escuchas", async () => {
    const { db } = createTestDb();
    expect(await getArtistasSinGeneros(db, HISTORICO)).toEqual([]);
  });

  it("lista los artistas que aún no tienen caché", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [...escuchas("Duster", 2), ...escuchas("Slowdive", 1)]);

    const p = await getArtistasSinGeneros(db, HISTORICO);
    expect(p.map((x) => x.name).sort()).toEqual(["Duster", "Slowdive"]);
  });

  it("excluye a los ya cacheados", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [...escuchas("Duster", 2), ...escuchas("Slowdive", 1)]);
    await guardarGeneros(db, "duster", ["slowcore"]);

    const p = await getArtistasSinGeneros(db, HISTORICO);
    expect(p.map((x) => x.name)).toEqual(["Slowdive"]);
  });

  it("los ordena por escuchas, para resolver primero lo que más pesa", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      ...escuchas("Poco", 1),
      ...escuchas("Mucho", 5),
      ...escuchas("Medio", 3),
    ]);

    expect((await getArtistasSinGeneros(db, HISTORICO)).map((x) => x.name)).toEqual([
      "Mucho",
      "Medio",
      "Poco",
    ]);
  });

  it("devuelve el nombre legible, no la clave", async () => {
    // Last.fm se consulta por nombre, así que la clave normalizada no sirve.
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, escuchas("Sigur Rós", 2));

    const p = await getArtistasSinGeneros(db, HISTORICO);
    expect(p[0]).toEqual({ key: "sigur ros", name: "Sigur Rós" });
  });

  it("respeta el límite", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(
      sqlite,
      Array.from({ length: 10 }, (_, i) => escuchas(`Artista ${i}`, 1)).flat(),
    );

    expect(await getArtistasSinGeneros(db, HISTORICO, 4)).toHaveLength(4);
  });
});

describe("getGenreBreakdown", () => {
  it("sin escuchas devuelve todo a cero", async () => {
    const { db } = createTestDb();
    expect(await getGenreBreakdown(db, HISTORICO)).toEqual({
      generos: [],
      epocas: [],
      procedencias: [],
      voces: [],
      analizados: 0,
      conEtiquetas: 0,
      sinEtiquetas: 0,
      pendientes: 0,
    });
  });

  it("cuenta cuántos artistas tienen etiquetas y cuántos faltan", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [...escuchas("Con", 2), ...escuchas("Sin", 1)]);
    await guardarGeneros(db, "con", ["shoegaze"]);

    const r = await getGenreBreakdown(db, HISTORICO);
    expect(r).toMatchObject({ analizados: 2, conEtiquetas: 1, pendientes: 1 });
  });

  // Un artista consultado del que Last.fm no sabe nada esta TERMINADO, no
  // pendiente. Contarlos juntos era lo que hacia que la pantalla dijera
  // «quedan 6 por resolver» mientras el boton no encontraba un solo candidato.
  it("separa al que no tiene etiquetas del que no se ha consultado", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [...escuchas("Vacío", 2), ...escuchas("Nuevo", 1)]);
    await guardarGeneros(db, "vacio", []);

    const r = await getGenreBreakdown(db, HISTORICO);
    expect(r).toMatchObject({ conEtiquetas: 0, sinEtiquetas: 1, pendientes: 1 });
    expect(r.generos).toEqual([]);
  });

  it("el listado del botón solo trae a los que no se han consultado", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [...escuchas("Vacío", 2), ...escuchas("Nuevo", 1)]);
    await guardarGeneros(db, "vacio", []);

    const p = await getArtistasSinGeneros(db, HISTORICO);
    expect(p.map((x) => x.key)).toEqual(["nuevo"]);
  });

  it("pondera cada género por las reproducciones de sus artistas", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [...escuchas("Mucho", 10), ...escuchas("Poco", 2)]);
    await guardarGeneros(db, "mucho", ["shoegaze"]);
    await guardarGeneros(db, "poco", ["punk"]);

    const { generos } = await getGenreBreakdown(db, HISTORICO);
    expect(generos.map((g) => [g.name, g.plays])).toEqual([
      ["shoegaze", 10],
      ["punk", 2],
    ]);
  });

  it("suma artistas que comparten género", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [...escuchas("Uno", 3), ...escuchas("Otro", 4)]);
    await guardarGeneros(db, "uno", ["shoegaze"]);
    await guardarGeneros(db, "otro", ["shoegaze"]);

    const { generos } = await getGenreBreakdown(db, HISTORICO);
    expect(generos).toHaveLength(1);
    expect(generos[0].plays).toBe(7);
    expect(generos[0].artistas).toBe(2);
  });

  it("atribuye a un artista solo sus tres primeros géneros", async () => {
    // Last.fm devuelve hasta seis etiquetas y las últimas son ruido.
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, escuchas("Etiquetado", 5));
    await guardarGeneros(db, "etiquetado", ["a", "b", "c", "d", "e"]);

    const { generos } = await getGenreBreakdown(db, HISTORICO);
    expect(generos.map((g) => g.name)).toEqual(["a", "b", "c"]);
  });

  it("share suma 1 sobre el total atribuido", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [...escuchas("Uno", 3), ...escuchas("Otro", 1)]);
    await guardarGeneros(db, "uno", ["x"]);
    await guardarGeneros(db, "otro", ["y"]);

    const { generos } = await getGenreBreakdown(db, HISTORICO);
    const suma = generos.reduce((n, g) => n + g.share, 0);
    expect(suma).toBeCloseTo(1);
    expect(generos[0].share).toBeCloseTo(0.75);
  });

  it("respeta el límite de géneros devueltos", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, escuchas("Uno", 5));
    await guardarGeneros(db, "uno", ["a", "b", "c"]);

    expect((await getGenreBreakdown(db, HISTORICO, 2)).generos).toHaveLength(2);
  });

  it("respeta el rango", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, [
      stream({ localDate: "2026-01-15", artistName: "Enero" }),
      stream({ localDate: "2026-06-15", artistName: "Junio" }),
    ]);
    await guardarGeneros(db, "enero", ["invierno"]);
    await guardarGeneros(db, "junio", ["verano"]);

    const enero: StatsRange = {
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
      label: "",
      preset: "custom",
    };

    const { generos } = await getGenreBreakdown(db, enero);
    expect(generos.map((g) => g.name)).toEqual(["invierno"]);
  });

  it("ignora un JSON de géneros corrupto sin romperse", async () => {
    const { db, sqlite } = createTestDb();
    seedStreams(sqlite, escuchas("Roto", 2));
    sqlite
      .prepare(
        "INSERT INTO artist_genres (artist_key, genres, fetched_at) VALUES (?, ?, ?)",
      )
      .run("roto", "{no es json", Date.now());

    const r = await getGenreBreakdown(db, HISTORICO);
    expect(r.generos).toEqual([]);
    expect(r.conEtiquetas).toBe(0);
  });

  describe("los ejes", () => {
    // Una de cada ocho etiquetas de Last.fm no es un genero: juntas, «female
    // vocalists» le quitaba el puesto ocho a un genero de verdad.
    it("saca del reparto de géneros lo que no lo es", async () => {
      const { db, sqlite } = createTestDb();
      seedStreams(sqlite, escuchas("Alguien", 5));
      await guardarGeneros(db, "alguien", [
        "shoegaze", "80s", "british", "female vocalists",
      ]);

      const r = await getGenreBreakdown(db, HISTORICO);
      expect(r.generos.map((g) => g.name)).toEqual(["shoegaze"]);
      expect(r.epocas.map((g) => g.name)).toEqual(["80s"]);
      expect(r.procedencias.map((g) => g.name)).toEqual(["british"]);
      expect(r.voces.map((g) => g.name)).toEqual(["female vocalists"]);
    });

    // El eje se cuenta sobre su propio total: con una sola epoca, esa epoca es
    // el cien por cien de tus epocas aunque solo la lleve un artista.
    it("reparte la proporción dentro de cada eje", async () => {
      const { db, sqlite } = createTestDb();
      seedStreams(sqlite, [...escuchas("Uno", 3), ...escuchas("Dos", 1)]);
      await guardarGeneros(db, "uno", ["shoegaze", "80s"]);
      await guardarGeneros(db, "dos", ["punk", "80s"]);

      const r = await getGenreBreakdown(db, HISTORICO);
      expect(r.epocas[0]).toMatchObject({ name: "80s", share: 1 });
      expect(r.generos.map((g) => g.share)).toEqual([0.75, 0.25]);
    });

    // Sobre su propio eje, «female vocalists» daba 96 % en los datos reales
    // —en Last.fm nadie etiqueta la voz masculina, se da por supuesta— y se
    // leia como si el 96 % de la musica la tuviera. El denominador honesto son
    // todos los artistas etiquetados.
    it("cuenta aparte qué parte de tus artistas la lleva", async () => {
      const { db, sqlite } = createTestDb();
      seedStreams(sqlite, [
        ...escuchas("Uno", 3), ...escuchas("Dos", 2), ...escuchas("Tres", 1),
      ]);
      await guardarGeneros(db, "uno", ["shoegaze", "female vocalists"]);
      await guardarGeneros(db, "dos", ["punk"]);
      await guardarGeneros(db, "tres", ["jazz"]);

      const r = await getGenreBreakdown(db, HISTORICO);
      // Es la unica etiqueta de voz, asi que sobre su eje es el 100 %...
      expect(r.voces[0].share).toBe(1);
      // ...pero solo la lleva uno de tus tres artistas etiquetados.
      expect(r.voces[0].shareArtistas).toBeCloseTo(1 / 3);
    });
  });

  describe("al abrir una etiqueta", () => {
    it("lleva sus artistas, del que más aporta al que menos", async () => {
      const { db, sqlite } = createTestDb();
      seedStreams(sqlite, [...escuchas("Poco", 2), ...escuchas("Mucho", 9)]);
      await guardarGeneros(db, "poco", ["shoegaze"]);
      await guardarGeneros(db, "mucho", ["shoegaze"]);

      const r = await getGenreBreakdown(db, HISTORICO);
      expect(r.generos[0].top.map((a) => a.name)).toEqual(["Mucho", "Poco"]);
      expect(r.generos[0].top[0].plays).toBe(9);
    });
  });

  describe("la rareza", () => {
    it("es la mediana de oyentes de sus artistas", async () => {
      const { db, sqlite } = createTestDb();
      seedStreams(sqlite, [
        ...escuchas("A", 3), ...escuchas("B", 2), ...escuchas("C", 1),
      ]);
      for (const k of ["a", "b", "c"]) await guardarGeneros(db, k, ["shoegaze"]);
      const ins = sqlite.prepare(
        "INSERT INTO artist_stats (artist_key, listeners, fetched_at) VALUES (?, ?, ?)",
      );
      ins.run("a", 100, Date.now());
      ins.run("b", 500, Date.now());
      ins.run("c", 900_000, Date.now());

      // Mediana y no media: el de novecientos mil arrastraria la media hasta
      // hacerla mentir sobre un genero de nicho.
      expect((await getGenreBreakdown(db, HISTORICO)).generos[0].oyentes).toBe(500);
    });

    it("es null si no se sabe de ninguno", async () => {
      const { db, sqlite } = createTestDb();
      seedStreams(sqlite, escuchas("A", 3));
      await guardarGeneros(db, "a", ["shoegaze"]);

      expect((await getGenreBreakdown(db, HISTORICO)).generos[0].oyentes).toBeNull();
    });
  });
});
