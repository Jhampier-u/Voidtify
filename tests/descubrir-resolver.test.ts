import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "./helpers/test-db";
import { resolverUris, type ParaResolver } from "@/lib/descubrir/resolver";
import { lastfmResolucion } from "@/db/schema";
import type { Db } from "@/lib/stats/shared";

const AHORA = 1_800_000_000_000;
const DIA = 86_400_000;

const RIDE: ParaResolver = {
  clave: "ridevapour trail",
  artista: "Ride",
  titulo: "Vapour Trail",
};
const LUSH: ParaResolver = {
  clave: "lushde-luxe",
  artista: "Lush",
  titulo: "De-Luxe",
};

describe("resolverUris", () => {
  let db: Db;
  let sqlite: ReturnType<typeof createTestDb>["sqlite"];

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    sqlite = t.sqlite;
  });

  const guardar = (clave: string, uri: string | null, cuando: number) =>
    sqlite
      .prepare(
        "INSERT INTO lastfm_resolucion (clave, track_uri, fetched_at) VALUES (?, ?, ?)",
      )
      .run(clave, uri, cuando);

  it("no busca nada si no se le pide nada", async () => {
    const buscar = vi.fn();
    expect((await resolverUris(db, [], buscar, AHORA)).size).toBe(0);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("busca lo que no está en caché y lo guarda", async () => {
    const buscar = vi.fn().mockResolvedValue("spotify:track:abc");
    const r = await resolverUris(db, [RIDE], buscar, AHORA);

    expect(r.get(RIDE.clave)).toBe("spotify:track:abc");
    expect(buscar).toHaveBeenCalledWith("Ride", "Vapour Trail");

    const filas = await db.select().from(lastfmResolucion);
    expect(filas).toHaveLength(1);
    expect(filas[0].trackUri).toBe("spotify:track:abc");
  });

  it("usa la caché en vez de volver a buscar", async () => {
    guardar(RIDE.clave, "spotify:track:cacheado", AHORA - DIA);
    const buscar = vi.fn();

    const r = await resolverUris(db, [RIDE], buscar, AHORA);
    expect(r.get(RIDE.clave)).toBe("spotify:track:cacheado");
    expect(buscar).not.toHaveBeenCalled();
  });

  it("solo busca lo que falta", async () => {
    guardar(RIDE.clave, "spotify:track:cacheado", AHORA - DIA);
    const buscar = vi.fn().mockResolvedValue("spotify:track:nuevo");

    await resolverUris(db, [RIDE, LUSH], buscar, AHORA);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(buscar).toHaveBeenCalledWith("Lush", "De-Luxe");
  });

  describe("los fallos", () => {
    // Sin guardarlos, cada visita repetiría la misma búsqueda infructuosa.
    it("se guardan para no repetir la búsqueda", async () => {
      const buscar = vi.fn().mockResolvedValue(null);
      const r = await resolverUris(db, [RIDE], buscar, AHORA);

      expect(r.get(RIDE.clave)).toBeNull();
      const filas = await db.select().from(lastfmResolucion);
      expect(filas[0].trackUri).toBeNull();
    });

    it("no se reintentan mientras son recientes", async () => {
      guardar(RIDE.clave, null, AHORA - 5 * DIA);
      const buscar = vi.fn();

      await resolverUris(db, [RIDE], buscar, AHORA);
      expect(buscar).not.toHaveBeenCalled();
    });

    // El catálogo de Spotify cambia: algo que no estaba puede aparecer.
    it("se reintentan pasado el plazo", async () => {
      guardar(RIDE.clave, null, AHORA - 40 * DIA);
      const buscar = vi.fn().mockResolvedValue("spotify:track:ya-existe");

      const r = await resolverUris(db, [RIDE], buscar, AHORA);
      expect(buscar).toHaveBeenCalledTimes(1);
      expect(r.get(RIDE.clave)).toBe("spotify:track:ya-existe");
    });

    // Un acierto no caduca: el URI de una canción no deja de serlo.
    it("un acierto antiguo no se reintenta", async () => {
      guardar(RIDE.clave, "spotify:track:viejo", AHORA - 400 * DIA);
      const buscar = vi.fn();

      await resolverUris(db, [RIDE], buscar, AHORA);
      expect(buscar).not.toHaveBeenCalled();
    });
  });

  // Guardar un fallo de red como "no existe" lo dejaría marcado como
  // inencontrable durante treinta días por un corte de un segundo.
  it("un error de red no se guarda como inexistente", async () => {
    const buscar = vi.fn().mockRejectedValue(new Error("sin conexión"));

    const r = await resolverUris(db, [RIDE], buscar, AHORA);
    expect(r.get(RIDE.clave)).toBeNull();
    expect(await db.select().from(lastfmResolucion)).toHaveLength(0);
  });

  it("no busca dos veces la misma canción repetida", async () => {
    const buscar = vi.fn().mockResolvedValue("spotify:track:abc");
    await resolverUris(db, [RIDE, { ...RIDE }], buscar, AHORA);
    expect(buscar).toHaveBeenCalledTimes(1);
  });
});
