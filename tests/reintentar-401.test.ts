import { describe, it, expect } from "vitest";
import { conTokenRenovable } from "@/lib/reintentar-401";
import { SpotifyApiError } from "@/lib/spotify-core";

/** Registra qué tokens se pidieron y con qué se llamó a la petición. */
function guion(respuestas: Record<string, "ok" | number>) {
  const tokens = ["viejo", "nuevo"];
  const pedidos: boolean[] = [];
  const usados: string[] = [];

  return {
    pedidos,
    usados,
    token: async (forzar: boolean) => {
      pedidos.push(forzar);
      return tokens[forzar ? 1 : 0];
    },
    peticion: async (t: string) => {
      usados.push(t);
      const r = respuestas[t];
      if (r !== "ok") throw new SpotifyApiError(`Spotify ${r}`, r as number);
      return `datos con ${t}`;
    },
  };
}

describe("conTokenRenovable", () => {
  it("usa el token guardado cuando funciona", async () => {
    const g = guion({ viejo: "ok" });
    expect(await conTokenRenovable(g.token, g.peticion)).toBe("datos con viejo");
    expect(g.pedidos).toEqual([false]);
  });

  it("no pide un token nuevo si no hizo falta", async () => {
    const g = guion({ viejo: "ok" });
    await conTokenRenovable(g.token, g.peticion);
    expect(g.pedidos).not.toContain(true);
  });

  describe("ante un 401", () => {
    it("fuerza un token nuevo y repite", async () => {
      const g = guion({ viejo: 401, nuevo: "ok" });
      expect(await conTokenRenovable(g.token, g.peticion)).toBe("datos con nuevo");
      expect(g.pedidos).toEqual([false, true]);
      expect(g.usados).toEqual(["viejo", "nuevo"]);
    });

    // Repetir con el mismo token daria el mismo 401 y gastaria peticiones.
    it("no repite si el refresco devolvió el mismo token", async () => {
      const pedidos: boolean[] = [];
      const usados: string[] = [];
      await expect(
        conTokenRenovable(
          async (forzar) => {
            pedidos.push(forzar);
            return "igual";
          },
          async (t) => {
            usados.push(t);
            throw new SpotifyApiError("Spotify 401", 401);
          },
        ),
      ).rejects.toThrow("Spotify 401");
      expect(pedidos).toEqual([false, true]);
      expect(usados).toEqual(["igual"]);
    });

    it("propaga el segundo 401 sin intentar un tercero", async () => {
      const g = guion({ viejo: 401, nuevo: 401 });
      await expect(conTokenRenovable(g.token, g.peticion)).rejects.toThrow(
        "Spotify 401",
      );
      expect(g.usados).toEqual(["viejo", "nuevo"]);
    });
  });

  describe("los demás errores", () => {
    // Un 403 o un 429 no se arreglan con otro token: refrescar solo retrasaria
    // el fallo real y gastaria una llamada al endpoint de token.
    it("no provocan un refresco", async () => {
      for (const status of [403, 429, 500]) {
        const g = guion({ viejo: status });
        await expect(conTokenRenovable(g.token, g.peticion)).rejects.toThrow(
          `Spotify ${status}`,
        );
        expect(g.pedidos).toEqual([false]);
      }
    });

    it("se propagan tal cual si no vienen de la Web API", async () => {
      const g = guion({});
      await expect(
        conTokenRenovable(g.token, async () => {
          throw new TypeError("fetch failed");
        }),
      ).rejects.toThrow("fetch failed");
      expect(g.pedidos).toEqual([false]);
    });
  });
});
