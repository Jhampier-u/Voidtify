import { describe, it, expect } from "vitest";
import { decidirAcceso } from "@/lib/acceso";

const DUENIO = "5yoocphndcotl7vhuaza755tk";
const OTRO = "cuenta_de_otra_persona";

describe("decidirAcceso", () => {
  it("deja entrar al primero cuando la instancia no tiene dueño", () => {
    const d = decidirAcceso(undefined, null, OTRO);
    expect(d).toEqual({ permitir: true, motivo: "sin-duenio" });
  });

  it("deja entrar al dueño guardado", () => {
    const d = decidirAcceso(undefined, DUENIO, DUENIO);
    expect(d.permitir).toBe(true);
  });

  it("rechaza a cualquier otra cuenta de Spotify", () => {
    const d = decidirAcceso(undefined, DUENIO, OTRO);
    expect(d).toEqual({ permitir: false, motivo: "fuera-de-lista" });
  });

  // El fallback histórico: antes se guardaba "me" cuando el perfil no traía id.
  // Si se tomara por una identidad real, el dueño no podría volver a entrar.
  it('trata "me" como identidad desconocida, no como dueño', () => {
    expect(decidirAcceso(undefined, "me", DUENIO).permitir).toBe(true);
    expect(decidirAcceso(undefined, "me", OTRO).motivo).toBe("sin-duenio");
  });

  it("rechaza cuando hay lista y Spotify no devuelve id", () => {
    const d = decidirAcceso(undefined, DUENIO, undefined);
    expect(d).toEqual({ permitir: false, motivo: "sin-id" });
  });

  it("no rechaza por falta de id si la instancia aún no tiene dueño", () => {
    expect(decidirAcceso(undefined, null, undefined).permitir).toBe(true);
  });

  describe("ALLOWED_SPOTIFY_USER_IDS", () => {
    it("manda sobre lo guardado", () => {
      expect(decidirAcceso(OTRO, DUENIO, OTRO).permitir).toBe(true);
      expect(decidirAcceso(OTRO, DUENIO, DUENIO).permitir).toBe(false);
    });

    it("admite varios, con espacios de más", () => {
      const d = decidirAcceso(` ${DUENIO} , ${OTRO} `, null, OTRO);
      expect(d.permitir).toBe(true);
    });

    // Una variable vacía o a base de comas es un descuido de configuración, no
    // una orden de bloquearlo todo: se cae a lo guardado.
    it("ignora una variable vacía y usa lo guardado", () => {
      expect(decidirAcceso("", DUENIO, OTRO).permitir).toBe(false);
      expect(decidirAcceso("  , ,", DUENIO, DUENIO).permitir).toBe(true);
    });
  });
});
