import { describe, it, expect } from "vitest";
import { saludCaptura, type EstadoCaptura } from "@/lib/salud-captura";

const AHORA = 1_700_000_000_000;
const HORA = 3_600_000;

const estado = (campos: Partial<EstadoCaptura> = {}): EstadoCaptura => ({
  lastRunAt: AHORA - 20 * 60_000,
  lastRunStatus: "ok",
  lastError: null,
  gapSuspectedAt: null,
  ...campos,
});

const salud = (campos?: Partial<EstadoCaptura>) =>
  saludCaptura(estado(campos), AHORA);

describe("saludCaptura", () => {
  it("no dice nada cuando la última corrió bien y hace poco", () => {
    expect(salud()).toEqual({ nivel: "ok", titulo: "", detalle: "" });
  });

  describe("sin ninguna ejecución", () => {
    it("es un fallo si no hay estado", () => {
      expect(saludCaptura(null, AHORA).nivel).toBe("fallo");
      expect(saludCaptura(undefined, AHORA).nivel).toBe("fallo");
    });

    it("es un fallo si la fila existe pero nunca corrió", () => {
      expect(saludCaptura(estado({ lastRunAt: null }), AHORA).titulo).toContain(
        "nunca",
      );
    });
  });

  describe("cuando lleva tiempo sin correr", () => {
    // Doce horas sobreviven a una noche con el equipo apagado. Con el umbral
    // anterior, de dos, cada mañana empezaba con una alarma falsa.
    it("aguanta una noche entera sin avisar", () => {
      expect(salud({ lastRunAt: AHORA - 11 * HORA }).nivel).toBe("ok");
    });

    it("avisa al pasar de doce horas", () => {
      const s = salud({ lastRunAt: AHORA - 13 * HORA });
      expect(s.nivel).toBe("fallo");
      expect(s.titulo).toContain("hace 13 h");
    });

    it("explica que un equipo apagado es normal", () => {
      expect(salud({ lastRunAt: AHORA - 3 * 24 * HORA }).detalle).toContain(
        "apagado",
      );
    });

    it("pesa más que el estado de la última, que ya es viejo", () => {
      const s = salud({ lastRunAt: AHORA - 20 * HORA, lastRunStatus: "error" });
      expect(s.titulo).toContain("no se ejecuta desde");
    });

    it("arrastra el último error, que sigue siendo la pista", () => {
      const s = salud({
        lastRunAt: AHORA - 20 * HORA,
        lastRunStatus: "error",
        lastError: "Spotify 401",
      });
      expect(s.detalle).toContain("Spotify 401");
    });
  });

  describe("cuando corre pero falla", () => {
    // El caso que se escapaba: la tarea puntual cada veinte minutos y todas
    // las ejecuciones devolviendo 401. Mirar solo la hora daba verde.
    it("es un fallo aunque acabe de ejecutarse", () => {
      const s = salud({ lastRunStatus: "error", lastError: "Spotify 401" });
      expect(s.nivel).toBe("fallo");
      expect(s.titulo).toContain("falló");
    });

    it("dice con qué falló", () => {
      expect(salud({ lastRunStatus: "error", lastError: "Spotify 401" }).detalle)
        .toContain("Spotify 401");
    });

    it("no inventa un error si no se guardó ninguno", () => {
      expect(salud({ lastRunStatus: "error" }).detalle).not.toContain("Último");
    });
  });

  describe("ante un hueco", () => {
    it("avisa sin llamarlo fallo: los datos que hay son buenos", () => {
      const s = salud({ gapSuspectedAt: AHORA - 2 * HORA, lastRunStatus: "gap" });
      expect(s.nivel).toBe("aviso");
    });

    it("dice cuándo se detectó", () => {
      expect(salud({ gapSuspectedAt: AHORA - 2 * HORA }).detalle).toContain(
        "hace 2 h",
      );
    });

    // Un error impide capturar; un hueco solo dice que quiza falte algo viejo.
    it("cede ante un error, que es más urgente", () => {
      const s = salud({ gapSuspectedAt: AHORA - HORA, lastRunStatus: "error" });
      expect(s.nivel).toBe("fallo");
    });
  });
});
