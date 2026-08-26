import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "./helpers/test-db";
import { seedStreams, stream } from "./helpers/seed-streams";
import {
  elegirArtista,
  getArtistasSinImagen,
  mejorImagen,
  rellenarImagenesEnLote,
  MAX_EDAD_MS,
  type ArtistaSpotify,
} from "@/lib/capture/rellenar-imagenes";
import { artistImagen } from "@/db/schema";
import { artistKey } from "@/lib/stats/normalize";
import type { Db } from "@/lib/stats/shared";

const AHORA = 1_800_000_000_000;
const DIA = 86_400_000;

const foto = (url: string, width: number) => ({ url, width });
const art = (
  id: string,
  name: string,
  images: { url: string; width: number }[] = [foto("u", 320)],
): ArtistaSpotify => ({ id, name, images });

describe("elegirArtista", () => {
  it("devuelve null si no hay resultados", () => {
    expect(elegirArtista([], artistKey("Duster"))).toBeNull();
  });

  // Spotify devuelve lo más parecido cuando no encuentra lo pedido. Coger el
  // primero sin más pondría la cara de un desconocido presidiendo el top, y un
  // error así no se detecta: un hueco se entiende, una foto equivocada no.
  it("no coge el primero si no es quien se buscaba", () => {
    const r = [art("1", "Duster Bennett"), art("2", "Dusty Springfield")];
    expect(elegirArtista(r, artistKey("Duster"))).toBeNull();
  });

  it("elige el que coincide, aunque no sea el primero", () => {
    const r = [art("1", "Duster Bennett"), art("2", "Duster")];
    expect(elegirArtista(r, artistKey("Duster"))?.id).toBe("2");
  });

  it("compara sin acentos ni mayúsculas", () => {
    const r = [art("1", "BJÖRK")];
    expect(elegirArtista(r, artistKey("Bjork"))?.id).toBe("1");
  });

  // Un artista sin fotos no sirve aunque el nombre encaje; puede haber otro
  // homónimo en la lista que sí las tenga.
  it("salta al homónimo que sí tiene fotos", () => {
    const r = [art("1", "Duster", []), art("2", "Duster")];
    expect(elegirArtista(r, artistKey("Duster"))?.id).toBe("2");
  });

  it("devuelve null si el que coincide no tiene fotos", () => {
    expect(elegirArtista([art("1", "Duster", [])], artistKey("Duster"))).toBeNull();
  });
});

describe("mejorImagen", () => {
  it("prefiere la más cercana a 320 px", () => {
    const a = art("1", "x", [foto("grande", 640), foto("media", 320), foto("chica", 160)]);
    expect(mejorImagen(a)).toBe("media");
  });

  it("se queda con la que haya si no está la ideal", () => {
    expect(mejorImagen(art("1", "x", [foto("solo", 640)]))).toBe("solo");
  });

  it("devuelve null sin fotos", () => {
    expect(mejorImagen(art("1", "x", []))).toBeNull();
  });
});

describe("getArtistasSinImagen", () => {
  let db: Db;
  let sqlite: ReturnType<typeof createTestDb>["sqlite"];

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    sqlite = t.sqlite;
  });

  const cachear = (nombre: string, cuando: number) =>
    sqlite
      .prepare(
        "INSERT INTO artist_imagen (artist_key, spotify_id, url, fetched_at) VALUES (?, ?, ?, ?)",
      )
      .run(artistKey(nombre), "id", "url", cuando);

  it("devuelve los que no tienen foto", () => {
    seedStreams(sqlite, [stream({ artistName: "Duster" })]);
    expect(getArtistasSinImagen(db, 10, AHORA).map((a) => a.name)).toEqual(["Duster"]);
  });

  it("omite los recientes", () => {
    seedStreams(sqlite, [stream({ artistName: "Duster" })]);
    cachear("Duster", AHORA - DIA);
    expect(getArtistasSinImagen(db, 10, AHORA)).toEqual([]);
  });

  // Las urls del CDN de Spotify no son eternas.
  it("los recupera cuando la url caduca", () => {
    seedStreams(sqlite, [stream({ artistName: "Duster" })]);
    cachear("Duster", AHORA - MAX_EDAD_MS - DIA);
    expect(getArtistasSinImagen(db, 10, AHORA)).toHaveLength(1);
  });

  it("pone delante a los más escuchados", () => {
    seedStreams(sqlite, [
      stream({ artistName: "Poco" }),
      stream({ artistName: "Mucho" }),
      stream({ artistName: "Mucho" }),
    ]);
    expect(getArtistasSinImagen(db, 10, AHORA).map((a) => a.name)).toEqual([
      "Mucho",
      "Poco",
    ]);
  });

  it("respeta el límite", () => {
    seedStreams(
      sqlite,
      Array.from({ length: 20 }, (_, i) => stream({ artistName: `A${i}` })),
    );
    expect(getArtistasSinImagen(db, 5, AHORA)).toHaveLength(5);
  });
});

describe("rellenarImagenesEnLote", () => {
  let db: Db;
  let sqlite: ReturnType<typeof createTestDb>["sqlite"];

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    sqlite = t.sqlite;
    seedStreams(sqlite, [stream({ artistName: "Duster" })]);
  });

  it("guarda id y url cuando encuentra", async () => {
    const buscar = vi.fn().mockResolvedValue([art("abc", "Duster")]);
    const r = await rellenarImagenesEnLote(db, buscar, 10, AHORA);

    expect(r).toEqual({ pedidos: 1, conFoto: 1 });
    const filas = await db.select().from(artistImagen);
    expect(filas[0]).toMatchObject({ spotifyId: "abc", url: "u" });
  });

  // Hay artistas que Spotify no tiene. Sin anotar el fallo se volverian a
  // buscar en cada captura, para siempre.
  it("anota el fallo para no repetir la búsqueda", async () => {
    const buscar = vi.fn().mockResolvedValue([]);
    const r = await rellenarImagenesEnLote(db, buscar, 10, AHORA);

    expect(r.conFoto).toBe(0);
    const filas = await db.select().from(artistImagen);
    expect(filas).toHaveLength(1);
    expect(filas[0].spotifyId).toBeNull();
  });

  // Un corte de un segundo no debe dejar a un artista sin foto dos meses.
  it("no anota nada si falla la red", async () => {
    const buscar = vi.fn().mockRejectedValue(new Error("sin conexión"));
    await rellenarImagenesEnLote(db, buscar, 10, AHORA);
    expect(await db.select().from(artistImagen)).toHaveLength(0);
  });
});

// Ordenar por escuchas de todos los tiempos dejaba sin foto justo a los que
// salen en pantalla: las vistas muestran las ultimas cuatro semanas por
// defecto, y el top historico puede no compartir un nombre con el reciente.
describe("getArtistasSinImagen · prioridad", () => {
  it("antepone lo que suena ahora al total historico", () => {
    const t = createTestDb();
    const hoy = new Date(AHORA).toISOString().slice(0, 10);
    const antiguo = new Date(AHORA - 400 * DIA).toISOString().slice(0, 10);

    seedStreams(t.sqlite, [
      // Un clasico con muchas escuchas, pero ninguna reciente.
      ...Array.from({ length: 20 }, () =>
        stream({ artistName: "Viejo", localDate: antiguo }),
      ),
      // Y uno que suena estos dias, con muchas menos.
      ...Array.from({ length: 3 }, () =>
        stream({ artistName: "Actual", localDate: hoy }),
      ),
    ]);

    expect(getArtistasSinImagen(t.db, 10, AHORA).map((a) => a.name)).toEqual([
      "Actual",
      "Viejo",
    ]);
  });
});
