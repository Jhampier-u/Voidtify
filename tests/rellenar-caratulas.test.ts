import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "./helpers/test-db";
import { seedStreams, stream } from "./helpers/seed-streams";
import {
  getPendientes,
  mejorCaratula,
  rellenarCaratulasEnLote,
  MAX_EDAD_MS,
  CLAVE_CUOTA,
  type PistaSpotify,
} from "@/lib/capture/rellenar-caratulas";
import {
  pausar,
  quedanSegundos,
  type Pausas,
} from "@/lib/capture/pausa-cuota";
import { SpotifyApiError } from "@/lib/spotify-core";
import { caratula } from "@/db/schema";
import { albumKey, trackKey } from "@/lib/stats/normalize";
import type { Db } from "@/lib/stats/shared";

const AHORA = 1_800_000_000_000;
const DIA = 86_400_000;

const pista = (uri: string, anchos: number[] = [640, 300, 64]): PistaSpotify => ({
  uri,
  album: { images: anchos.map((w) => ({ url: `u${w}`, width: w })) },
});

describe("mejorCaratula", () => {
  it("prefiere la más cercana a 300 px", () => {
    expect(mejorCaratula(pista("x"))).toBe("u300");
  });

  it("se queda con la que haya", () => {
    expect(mejorCaratula(pista("x", [640]))).toBe("u640");
  });

  it("devuelve null si el álbum no trae imágenes", () => {
    expect(mejorCaratula({ uri: "x", album: { images: [] } })).toBeNull();
    expect(mejorCaratula({ uri: "x" })).toBeNull();
  });
});

describe("getPendientes", () => {
  let db: Db;
  let sqlite: ReturnType<typeof createTestDb>["sqlite"];

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    sqlite = t.sqlite;
  });

  const cachear = (tipo: string, clave: string, cuando: number) =>
    sqlite
      .prepare(
        "INSERT INTO caratula (tipo, clave, url, fetched_at) VALUES (?, ?, ?, ?)",
      )
      .run(tipo, clave, "u", cuando);

  it("devuelve las canciones sin carátula, con una uri", () => {
    seedStreams(sqlite, [
      stream({ trackName: "Alison", trackUri: "spotify:track:abc" }),
    ]);
    expect(getPendientes(db, "cancion", 10, AHORA)).toEqual([
      { clave: trackKey("Slowdive", "Alison"), uri: "spotify:track:abc" },
    ]);
  });

  // La carátula de un álbum sale de cualquiera de sus pistas, así que basta con
  // una: por eso los dos tipos se resuelven por el mismo camino.
  it("agrupa el álbum en una sola entrada aunque tenga varias pistas", () => {
    seedStreams(sqlite, [
      stream({ trackName: "Alison", albumName: "Souvlaki" }),
      stream({ trackName: "Dagger", albumName: "Souvlaki" }),
    ]);
    const p = getPendientes(db, "album", 10, AHORA);
    expect(p).toHaveLength(1);
    expect(p[0].clave).toBe(albumKey("Slowdive", "Souvlaki"));
  });

  it("omite las ya cacheadas y recientes", () => {
    seedStreams(sqlite, [stream({ trackName: "Alison" })]);
    cachear("cancion", trackKey("Slowdive", "Alison"), AHORA - DIA);
    expect(getPendientes(db, "cancion", 10, AHORA)).toEqual([]);
  });

  it("las recupera cuando caducan", () => {
    seedStreams(sqlite, [stream({ trackName: "Alison" })]);
    cachear("cancion", trackKey("Slowdive", "Alison"), AHORA - MAX_EDAD_MS - DIA);
    expect(getPendientes(db, "cancion", 10, AHORA)).toHaveLength(1);
  });

  // Una cancion cacheada no debe tapar a su album, que es otro tipo.
  it("no confunde los dos tipos", () => {
    seedStreams(sqlite, [stream({ trackName: "Alison", albumName: "Souvlaki" })]);
    cachear("cancion", trackKey("Slowdive", "Alison"), AHORA - DIA);
    expect(getPendientes(db, "cancion", 10, AHORA)).toEqual([]);
    expect(getPendientes(db, "album", 10, AHORA)).toHaveLength(1);
  });

  it("ignora las filas sin uri, que no se pueden resolver", () => {
    seedStreams(sqlite, [stream({ trackName: "Alison", trackUri: null })]);
    expect(getPendientes(db, "cancion", 10, AHORA)).toEqual([]);
  });

  // El historial es una lista cronologica: lo que se ve es lo ultimo que sono,
  // repetido o no. Con el orden por recuento, una cancion oida una sola vez
  // ayer quedaba detras de miles con mas escuchas y nunca llegaba su turno.
  it("antepone lo ultimo escuchado, aunque solo sonara una vez", () => {
    seedStreams(sqlite, [
      ...Array.from({ length: 20 }, (_, i) =>
        stream({ trackName: "Muy escuchada", ts: AHORA - 100 * DIA + i }),
      ),
      stream({ trackName: "De ayer", ts: AHORA - DIA }),
    ]);
    expect(getPendientes(db, "cancion", 10, AHORA)[0].clave).toBe(
      trackKey("Slowdive", "De ayer"),
    );
  });
});

describe("rellenarCaratulasEnLote", () => {
  let db: Db;
  let sqlite: ReturnType<typeof createTestDb>["sqlite"];

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    sqlite = t.sqlite;
  });

  it("pide una por una y guarda todas", async () => {
    seedStreams(
      sqlite,
      Array.from({ length: 12 }, (_, i) =>
        stream({ trackName: `T${i}`, trackUri: `spotify:track:t${i}` }),
      ),
    );
    const pedir = vi.fn(async (id: string) => pista(`spotify:track:${id}`));

    const r = await rellenarCaratulasEnLote(db, "cancion", pedir, 50, AHORA);
    expect(pedir).toHaveBeenCalledTimes(12);
    expect(r.conCaratula).toBe(12);
  });

  // Una pista retirada del catalogo devuelve null. Debe anotarse el hueco, no
  // dejarse sin fila.
  it("anota el hueco cuando la pista ya no existe", async () => {
    seedStreams(sqlite, [stream({ trackName: "Retirada" })]);
    const pedir = vi.fn().mockResolvedValue(null);

    await rellenarCaratulasEnLote(db, "cancion", pedir, 50, AHORA);
    const filas = await db.select().from(caratula);
    expect(filas).toHaveLength(1);
    expect(filas[0].url).toBeNull();
  });

  // La version anterior hacia `continue` en silencio, y cuando el endpoint en
  // lote empezo a devolver 403 la funcion parecia no hacer nada sin dar una
  // sola pista de por que. Los fallos se cuentan.
  it("cuenta los fallos en vez de tragarselos", async () => {
    seedStreams(sqlite, [
      stream({ trackName: "A" }),
      stream({ trackName: "B" }),
    ]);
    const pedir = vi.fn().mockRejectedValue(new Error("403"));

    const r = await rellenarCaratulasEnLote(db, "cancion", pedir, 50, AHORA);
    expect(r).toMatchObject({ pedidos: 2, conCaratula: 0, fallos: 2 });
  });

  it("no anota nada si falla la red", async () => {
    seedStreams(sqlite, [stream({ trackName: "Alison" })]);
    const pedir = vi.fn().mockRejectedValue(new Error("sin conexión"));

    await rellenarCaratulasEnLote(db, "cancion", pedir, 50, AHORA);
    expect(await db.select().from(caratula)).toHaveLength(0);
  });

  it("no llama a Spotify si no hay nada pendiente", async () => {
    const pedir = vi.fn();
    const r = await rellenarCaratulasEnLote(db, "cancion", pedir, 50, AHORA);
    expect(pedir).not.toHaveBeenCalled();
    expect(r).toEqual({ pedidos: 0, conCaratula: 0, fallos: 0, pausado: false });
  });

  describe("ante la cuota de /tracks", () => {
    const cuota = () => new SpotifyApiError("Spotify 429", 429, 623);

    // El fallo que dejo las caratulas un dia sin avanzar: Spotify decia
    // «espera 623 segundos» y la pista siguiente salia sin pausa. Quince
    // rechazos por lote, cada veinte minutos, indefinidamente.
    it("corta el lote en la primera y no pide las demas", async () => {
      seedStreams(sqlite, [
        stream({ trackName: "A" }),
        stream({ trackName: "B" }),
        stream({ trackName: "C" }),
      ]);
      const pedir = vi.fn().mockRejectedValue(cuota());

      const r = await rellenarCaratulasEnLote(db, "cancion", pedir, 50, AHORA, {});
      expect(pedir).toHaveBeenCalledTimes(1);
      expect(r.pausado).toBe(true);
    });

    it("anota la espera que pide Spotify", async () => {
      seedStreams(sqlite, [stream({ trackName: "A" })]);
      const pausas: Pausas = {};

      await rellenarCaratulasEnLote(
        db,
        "cancion",
        vi.fn().mockRejectedValue(cuota()),
        50,
        AHORA,
        pausas,
      );
      expect(quedanSegundos(pausas, CLAVE_CUOTA, AHORA)).toBe(623);
    });

    it("no pide nada mientras dura la espera", async () => {
      seedStreams(sqlite, [stream({ trackName: "A" })]);
      const pausas: Pausas = {};
      pausar(pausas, CLAVE_CUOTA, 600, AHORA);
      const pedir = vi.fn();

      const r = await rellenarCaratulasEnLote(
        db, "cancion", pedir, 50, AHORA, pausas,
      );
      expect(pedir).not.toHaveBeenCalled();
      expect(r).toEqual({ pedidos: 0, conCaratula: 0, fallos: 0, pausado: true });
    });

    it("vuelve a pedir cuando la espera termina", async () => {
      seedStreams(sqlite, [stream({ trackName: "A" })]);
      const pausas: Pausas = {};
      pausar(pausas, CLAVE_CUOTA, 600, AHORA);
      const pedir = vi.fn().mockResolvedValue(pista("spotify:track:a"));

      await rellenarCaratulasEnLote(
        db, "cancion", pedir, 50, AHORA + 601_000, pausas,
      );
      expect(pedir).toHaveBeenCalledTimes(1);
    });

    // Un 403 es un permiso retirado: esperar no lo arregla y parar el relleno
    // por el escondería el problema real detrás de una pausa silenciosa.
    it("un 403 no pausa: se cuenta como fallo y el lote sigue", async () => {
      seedStreams(sqlite, [
        stream({ trackName: "A" }),
        stream({ trackName: "B" }),
      ]);
      const pausas: Pausas = {};
      const pedir = vi
        .fn()
        .mockRejectedValue(new SpotifyApiError("Spotify 403", 403));

      const r = await rellenarCaratulasEnLote(
        db, "cancion", pedir, 50, AHORA, pausas,
      );
      expect(pedir).toHaveBeenCalledTimes(2);
      expect(r).toMatchObject({ fallos: 2, pausado: false });
      expect(quedanSegundos(pausas, CLAVE_CUOTA, AHORA)).toBe(0);
    });
  });
});
