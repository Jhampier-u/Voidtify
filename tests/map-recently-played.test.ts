import { describe, expect, it } from "vitest";
import {
  mapRecentlyPlayed,
  type RecentlyPlayedItem,
} from "@/lib/capture/map-recently-played";

function item(over: Partial<RecentlyPlayedItem> = {}): RecentlyPlayedItem {
  return {
    played_at: "2026-07-15T18:30:00.000Z",
    track: {
      uri: "spotify:track:abc",
      name: "Alison",
      duration_ms: 216_000,
      artists: [{ id: "a1", name: "Slowdive" }],
      album: { id: "al1", name: "Souvlaki" },
    },
    ...over,
  };
}

describe("mapRecentlyPlayed", () => {
  it("convierte un item en una fila de stream", () => {
    const [fila] = mapRecentlyPlayed([item()], "UTC");

    expect(fila.ts).toBe(Date.UTC(2026, 6, 15, 18, 30, 0));
    expect(fila.trackName).toBe("Alison");
    expect(fila.artistName).toBe("Slowdive");
    expect(fila.albumName).toBe("Souvlaki");
    expect(fila.trackUri).toBe("spotify:track:abc");
    expect(fila.source).toBe("live");
  });

  it("normaliza las claves de agrupación", () => {
    const [fila] = mapRecentlyPlayed([item()], "UTC");
    expect(fila.artistKey).toBe("slowdive");
    expect(fila.trackKey).toBe("slowdive\u001Falison");
    expect(fila.albumKey).toBe("slowdive\u001Fsouvlaki");
  });

  it("calcula la fecha y hora local", () => {
    const [fila] = mapRecentlyPlayed([item()], "America/Lima");
    expect(fila.localDate).toBe("2026-07-15");
    expect(fila.localHour).toBe(13);
  });

  it("usa la duración completa como ms_played", () => {
    // recently-played no informa de cuánto sonó. Es una sobreestimación
    // acotada y temporal: el dump reemplazará este rango con datos exactos.
    const [fila] = mapRecentlyPlayed([item()], "UTC");
    expect(fila.msPlayed).toBe(216_000);
  });

  it("deja a null los campos que la API no proporciona", () => {
    const [fila] = mapRecentlyPlayed([item()], "UTC");
    expect(fila.skipped).toBeNull();
    expect(fila.reasonStart).toBeNull();
    expect(fila.reasonEnd).toBeNull();
    expect(fila.shuffle).toBeNull();
  });

  it("construye el dedup_key con el timestamp y el uri", () => {
    const [fila] = mapRecentlyPlayed([item()], "UTC");
    expect(fila.dedupKey).toBe(`${Date.UTC(2026, 6, 15, 18, 30, 0)}:spotify:track:abc`);
  });

  it("usa track_key en el dedup_key cuando no hay uri", () => {
    const sinUri = item({
      track: { ...item().track!, uri: "" },
    });
    const [fila] = mapRecentlyPlayed([sinUri], "UTC");
    expect(fila.trackUri).toBeNull();
    expect(fila.dedupKey).toBe(
      `${Date.UTC(2026, 6, 15, 18, 30, 0)}:slowdive\u001Falison`,
    );
  });

  it("acepta la clave `item` además de `track`", () => {
    // El fork de feb 2026 renombró `track` a `item` en playlists; se admiten
    // las dos formas por si recently-played sigue el mismo camino.
    const conItem: RecentlyPlayedItem = {
      played_at: "2026-07-15T18:30:00.000Z",
      item: item().track,
    };
    const [fila] = mapRecentlyPlayed([conItem], "UTC");
    expect(fila.trackName).toBe("Alison");
  });

  it("descarta items sin pista", () => {
    const vacio: RecentlyPlayedItem = { played_at: "2026-07-15T18:30:00.000Z" };
    expect(mapRecentlyPlayed([vacio], "UTC")).toHaveLength(0);
  });

  it("descarta items con fecha inválida", () => {
    expect(mapRecentlyPlayed([item({ played_at: "no-es-fecha" })], "UTC")).toHaveLength(0);
  });

  it("usa el primer artista cuando hay varios", () => {
    const varios = item({
      track: {
        ...item().track!,
        artists: [
          { id: "a1", name: "Slowdive" },
          { id: "a2", name: "Mojave 3" },
        ],
      },
    });
    const [fila] = mapRecentlyPlayed([varios], "UTC");
    expect(fila.artistName).toBe("Slowdive");
  });

  it("tolera un item sin artistas", () => {
    const sinArtistas = item({ track: { ...item().track!, artists: [] } });
    expect(mapRecentlyPlayed([sinArtistas], "UTC")).toHaveLength(0);
  });

  describe("cuánto sonó cada una", () => {
    // `played_at` es el FINAL de la reproduccion. Se comprobo contra el
    // volcado, donde ms_played si es real: el hueco entre dos marcas coincide
    // con lo que sono la SEGUNDA en el 85 % de los casos y con lo que sono la
    // primera solo en el 13 %.
    const en = (iso: string, dur: number, nombre: string): RecentlyPlayedItem =>
      item({
        played_at: iso,
        track: {
          uri: `spotify:track:${nombre}`,
          name: nombre,
          duration_ms: dur,
          artists: [{ id: "a1", name: "Slowdive" }],
          album: { id: "al1", name: "Souvlaki" },
        },
      });

    it("acota el tiempo con el hueco desde la anterior", () => {
      const filas = mapRecentlyPlayed(
        [
          en("2026-07-15T18:00:00.000Z", 200_000, "primera"),
          // Termina 90 s despues: eso es lo que sono, aunque dure 240.
          en("2026-07-15T18:01:30.000Z", 240_000, "segunda"),
        ],
        "UTC",
      );
      expect(filas.find((f) => f.trackName === "segunda")!.msPlayed).toBe(90_000);
    });

    it("no pasa de la duración aunque el hueco sea mayor", () => {
      const filas = mapRecentlyPlayed(
        [
          en("2026-07-15T18:00:00.000Z", 200_000, "primera"),
          en("2026-07-15T18:10:00.000Z", 180_000, "segunda"),
        ],
        "UTC",
      );
      expect(filas.find((f) => f.trackName === "segunda")!.msPlayed).toBe(180_000);
    });

    // Por encima de media hora el hueco no mide una reproduccion sino una
    // pausa: darla por sonada entera seria inventarse el tiempo.
    it("vuelve a la duración tras una pausa larga", () => {
      const filas = mapRecentlyPlayed(
        [
          en("2026-07-15T18:00:00.000Z", 200_000, "primera"),
          en("2026-07-15T19:30:00.000Z", 240_000, "segunda"),
        ],
        "UTC",
      );
      expect(filas.find((f) => f.trackName === "segunda")!.msPlayed).toBe(240_000);
    });

    it("la primera del lote se acota con la última ya guardada", () => {
      const anterior = Date.UTC(2026, 6, 15, 18, 0, 0);
      const [fila] = mapRecentlyPlayed(
        [en("2026-07-15T18:01:00.000Z", 240_000, "unica")],
        "UTC",
        anterior,
      );
      expect(fila.msPlayed).toBe(60_000);
    });

    it("sin nada guardado antes, la primera conserva su duración", () => {
      const [fila] = mapRecentlyPlayed(
        [en("2026-07-15T18:01:00.000Z", 240_000, "unica")],
        "UTC",
        null,
      );
      expect(fila.msPlayed).toBe(240_000);
    });

    // La API los devuelve del mas reciente al mas antiguo: sin ordenar, los
    // huecos saldrian negativos y no se usaria ninguno.
    it("mide bien aunque lleguen del más reciente al más antiguo", () => {
      const filas = mapRecentlyPlayed(
        [
          en("2026-07-15T18:01:30.000Z", 240_000, "segunda"),
          en("2026-07-15T18:00:00.000Z", 200_000, "primera"),
        ],
        "UTC",
      );
      expect(filas.find((f) => f.trackName === "segunda")!.msPlayed).toBe(90_000);
    });

    it("devuelve las filas en el orden en que sonaron", () => {
      const filas = mapRecentlyPlayed(
        [
          en("2026-07-15T18:01:30.000Z", 240_000, "segunda"),
          en("2026-07-15T18:00:00.000Z", 200_000, "primera"),
        ],
        "UTC",
      );
      expect(filas.map((f) => f.trackName)).toEqual(["primera", "segunda"]);
    });

    it("un hueco de cero no se usa", () => {
      const filas = mapRecentlyPlayed(
        [
          en("2026-07-15T18:00:00.000Z", 200_000, "primera"),
          en("2026-07-15T18:00:00.000Z", 240_000, "segunda"),
        ],
        "UTC",
      );
      expect(filas.find((f) => f.trackName === "segunda")!.msPlayed).toBe(240_000);
    });
  });
});
