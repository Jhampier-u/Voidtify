import { describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import {
  getContraste,
  contarTomas,
  EQUIVALENCIAS,
} from "@/lib/stats/snapshots";
import { createTestDb } from "./helpers/test-db";
import { seedStreams, stream } from "./helpers/seed-streams";

const HOY = "2026-03-15";

function guardarSnapshot(
  sqlite: Database.Database,
  entity: string,
  timeRange: string,
  nombres: string[],
  takenAt = 1_700_000_000_000,
) {
  sqlite
    .prepare(
      "INSERT INTO top_snapshots (taken_at, time_range, entity, payload_json) VALUES (?, ?, ?, ?)",
    )
    .run(
      takenAt,
      timeRange,
      entity,
      JSON.stringify({ items: nombres.map((name) => ({ name })) }),
    );
}

/** Guarda una toma con el payload literal, para probar campos que no son el nombre. */
function guardarToma(
  sqlite: Database.Database,
  entity: string,
  timeRange: string,
  takenAt: number,
  payload: unknown,
) {
  sqlite
    .prepare(
      "INSERT INTO top_snapshots (taken_at, time_range, entity, payload_json) VALUES (?, ?, ?, ?)",
    )
    .run(takenAt, timeRange, entity, JSON.stringify(payload));
}

function escuchas(artista: string, n: number, localDate = "2026-03-10") {
  return Array.from({ length: n }, () =>
    stream({ localDate, artistName: artista }),
  );
}

describe("EQUIVALENCIAS", () => {
  it("cubre las tres ventanas de Spotify", () => {
    expect(Object.keys(EQUIVALENCIAS).sort()).toEqual([
      "long_term",
      "medium_term",
      "short_term",
    ]);
  });

  it("el rango largo no tiene límite de días", () => {
    expect(EQUIVALENCIAS.long_term.dias).toBeNull();
  });
});

describe("contarTomas", () => {
  it("cuenta cero sin snapshots", async () => {
    const { db } = createTestDb();
    expect(await contarTomas(db)).toBe(0);
  });

  it("cuenta instantes distintos, no filas", async () => {
    // Una toma guarda seis filas: dos entidades por tres ventanas.
    const { db, sqlite } = createTestDb();
    guardarSnapshot(sqlite, "artists", "short_term", ["A"], 1000);
    guardarSnapshot(sqlite, "artists", "long_term", ["B"], 1000);
    guardarSnapshot(sqlite, "tracks", "short_term", ["C"], 1000);

    expect(await contarTomas(db)).toBe(1);
  });

  it("distingue tomas de días distintos", async () => {
    const { db, sqlite } = createTestDb();
    guardarSnapshot(sqlite, "artists", "short_term", ["A"], 1000);
    guardarSnapshot(sqlite, "artists", "short_term", ["B"], 2000);

    expect(await contarTomas(db)).toBe(2);
  });
});

describe("getContraste", () => {
  it("devuelve null si no hay ninguna toma", async () => {
    const { db } = createTestDb();
    expect(await getContraste(db, "artists", "long_term", HOY)).toBeNull();
  });

  it("lee los nombres del payload de Spotify", async () => {
    const { db, sqlite } = createTestDb();
    guardarSnapshot(sqlite, "artists", "long_term", ["Pixies", "TV Girl"]);

    const c = await getContraste(db, "artists", "long_term", HOY);
    expect(c?.spotify.map((x) => x.name)).toEqual(["Pixies", "TV Girl"]);
  });

  it("usa la toma más reciente si hay varias", async () => {
    const { db, sqlite } = createTestDb();
    guardarSnapshot(sqlite, "artists", "long_term", ["Antiguo"], 1000);
    guardarSnapshot(sqlite, "artists", "long_term", ["Reciente"], 9000);

    const c = await getContraste(db, "artists", "long_term", HOY);
    expect(c?.spotify.map((x) => x.name)).toEqual(["Reciente"]);
    expect(c?.tomadoEl).toBe(9000);
  });

  it("no mezcla entidades ni ventanas", async () => {
    const { db, sqlite } = createTestDb();
    guardarSnapshot(sqlite, "artists", "long_term", ["Artista largo"]);
    guardarSnapshot(sqlite, "artists", "short_term", ["Artista corto"]);
    guardarSnapshot(sqlite, "tracks", "long_term", ["Canción larga"]);

    expect(
      (await getContraste(db, "artists", "short_term", HOY))?.spotify.map(
        (x) => x.name,
      ),
    ).toEqual([
      "Artista corto",
    ]);
    expect(
      (await getContraste(db, "tracks", "long_term", HOY))?.spotify.map(
        (x) => x.name,
      ),
    ).toEqual([
      "Canción larga",
    ]);
  });

  it("calcula el ranking propio contando reproducciones", async () => {
    const { db, sqlite } = createTestDb();
    guardarSnapshot(sqlite, "artists", "long_term", ["Da igual"]);
    seedStreams(sqlite, [...escuchas("Mucho", 5), ...escuchas("Poco", 2)]);

    const c = await getContraste(db, "artists", "long_term", HOY);
    expect(c?.propio).toMatchObject([
      { name: "Mucho", plays: 5 },
      { name: "Poco", plays: 2 },
    ]);
  });

  it("el rango largo mira todo el historial", async () => {
    const { db, sqlite } = createTestDb();
    guardarSnapshot(sqlite, "artists", "long_term", ["x"]);
    seedStreams(sqlite, escuchas("Viejo", 3, "2019-01-01"));

    expect(
      (await getContraste(db, "artists", "long_term", HOY))?.propio,
    ).toMatchObject([
      { name: "Viejo", plays: 3 },
    ]);
  });

  it("el rango corto recorta a las últimas cuatro semanas", async () => {
    const { db, sqlite } = createTestDb();
    guardarSnapshot(sqlite, "artists", "short_term", ["x"]);
    seedStreams(sqlite, [
      ...escuchas("Dentro", 2, "2026-03-14"),
      ...escuchas("Fuera", 9, "2025-01-01"),
    ]);

    const c = await getContraste(db, "artists", "short_term", HOY);
    expect(c?.propio.map((p) => p.name)).toEqual(["Dentro"]);
  });

  it("la ventana equivalente se calcula sobre días de calendario", async () => {
    // 27 días atrás desde el 15 de marzo es el 16 de febrero, inclusive.
    const { db, sqlite } = createTestDb();
    guardarSnapshot(sqlite, "artists", "short_term", ["x"]);
    seedStreams(sqlite, [
      ...escuchas("Justo dentro", 1, "2026-02-16"),
      ...escuchas("Justo fuera", 1, "2026-02-15"),
    ]);

    const c = await getContraste(db, "artists", "short_term", HOY);
    expect(c?.propio.map((p) => p.name)).toEqual(["Justo dentro"]);
  });

  it("respeta el límite en ambas listas", async () => {
    const { db, sqlite } = createTestDb();
    guardarSnapshot(sqlite, "artists", "long_term", ["a", "b", "c", "d"]);
    seedStreams(
      sqlite,
      Array.from({ length: 4 }, (_, i) => escuchas(`Artista ${i}`, i + 1)).flat(),
    );

    const c = await getContraste(db, "artists", "long_term", HOY, 2);
    expect(c?.spotify).toHaveLength(2);
    expect(c?.propio).toHaveLength(2);
  });

  it("sobrevive a un payload corrupto devolviendo lista vacía", async () => {
    const { db, sqlite } = createTestDb();
    sqlite
      .prepare(
        "INSERT INTO top_snapshots (taken_at, time_range, entity, payload_json) VALUES (?, ?, ?, ?)",
      )
      .run(1000, "long_term", "artists", "{roto");

    const c = await getContraste(db, "artists", "long_term", HOY);
    expect(c?.spotify).toEqual([]);
  });

  it("ignora items del payload sin nombre", async () => {
    const { db, sqlite } = createTestDb();
    sqlite
      .prepare(
        "INSERT INTO top_snapshots (taken_at, time_range, entity, payload_json) VALUES (?, ?, ?, ?)",
      )
      .run(
        1000,
        "long_term",
        "artists",
        JSON.stringify({ items: [{ name: "Bueno" }, {}, { name: null }] }),
      );

    expect(
      (await getContraste(db, "artists", "long_term", HOY))?.spotify.map(
        (x) => x.name,
      ),
    ).toEqual([
      "Bueno",
    ]);
  });
});

// La imagen sale del propio payload, que guarda el objeto entero tal como lo
// devolvio Spotify: no cuesta ninguna peticion y es la foto de aquel dia.
describe("getContraste · imagenes de la toma", () => {
  it("saca la foto del artista", async () => {
    const { db, sqlite } = createTestDb();
    guardarToma(sqlite, "artists", "long_term", 1_700_000_000_000, {
      items: [
        {
          name: "Pixies",
          images: [
            { url: "grande", width: 640 },
            { url: "media", width: 300 },
          ],
        },
      ],
    });
    const c = await getContraste(db, "artists", "long_term", HOY);
    expect(c?.spotify[0].imagen).toBe("media");
  });

  // Las pistas la llevan en su album, no en la raiz.
  it("saca la carátula del álbum de la pista", async () => {
    const { db, sqlite } = createTestDb();
    guardarToma(sqlite, "tracks", "long_term", 1_700_000_000_000, {
      items: [{ name: "Alison", album: { images: [{ url: "u", width: 300 }] } }],
    });
    const c = await getContraste(db, "tracks", "long_term", HOY);
    expect(c?.spotify[0].imagen).toBe("u");
  });

  it("aguanta una toma sin imágenes", async () => {
    const { db, sqlite } = createTestDb();
    guardarToma(sqlite, "artists", "long_term", 1_700_000_000_000, {
      items: [{ name: "Sin foto" }],
    });
    const c = await getContraste(db, "artists", "long_term", HOY);
    expect(c?.spotify[0]).toEqual({ name: "Sin foto", imagen: undefined });
  });
});
