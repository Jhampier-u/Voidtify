import { describe, it, expect } from "vitest";
// Módulo .mjs sin tipos, compartido con el script de copia para que la regla
// de retención tenga una sola implementación.
import { aBorrar } from "../scripts/rotacion.mjs";

const copia = (fecha: string) => `ledger-${fecha}.db.gz`;

/** Copias diarias consecutivas hacia atrás desde una fecha. */
function serie(desde: string, dias: number): string[] {
  const out: string[] = [];
  const ms = Date.parse(desde + "T00:00:00Z");
  for (let i = 0; i < dias; i++) {
    out.push(copia(new Date(ms - i * 86_400_000).toISOString().slice(0, 10)));
  }
  return out;
}

describe("aBorrar", () => {
  it("no borra nada si no hay copias", () => {
    expect(aBorrar([])).toEqual([]);
  });

  it("no borra nada mientras quepan en la ventana diaria", () => {
    expect(aBorrar(serie("2026-08-25", 14))).toEqual([]);
  });

  it("borra lo que sale de la ventana diaria", () => {
    const sobran = aBorrar(serie("2026-08-25", 20), { mensuales: 0 });
    expect(sobran).toHaveLength(6);
    // Las seis más antiguas, nunca las recientes.
    expect(sobran).toContain(copia("2026-08-06"));
    expect(sobran).not.toContain(copia("2026-08-25"));
    expect(sobran).not.toContain(copia("2026-08-12"));
  });

  // Una semana mala se deshace con las diarias; un error de hace medio año
  // necesita algo más viejo desde donde volver.
  it("conserva la del día 1 aunque salga de la ventana diaria", () => {
    const sobran = aBorrar(serie("2026-08-25", 40));
    expect(sobran).not.toContain(copia("2026-08-01"));
    expect(sobran).toContain(copia("2026-08-02"));
  });

  it("respeta el tope de mensuales", () => {
    const nombres = [
      ...serie("2026-08-25", 14),
      copia("2026-07-01"),
      copia("2026-06-01"),
      copia("2026-05-01"),
    ];
    const sobran = aBorrar(nombres, { mensuales: 2 });
    expect(sobran).toEqual([copia("2026-05-01")]);
  });

  it("guarda las mensuales más recientes cuando hay que elegir", () => {
    const nombres = [copia("2026-01-01"), copia("2026-03-01"), copia("2026-02-01")];
    const sobran = aBorrar(nombres, { diarias: 0, mensuales: 2 });
    expect(sobran).toEqual([copia("2026-01-01")]);
  });

  // La carpeta puede tener cualquier otra cosa dentro. Borrar por descarte
  // convertiría esto en una trituradora de lo que no entiende.
  describe("lo que no reconoce", () => {
    it("no lo borra nunca", () => {
      const nombres = [
        ...serie("2026-08-25", 20),
        "notas.txt",
        "ledger.db",
        "ledger-2026-08-01.db", // sin comprimir: otro patrón
        "copia manual importante.zip",
        "desktop.ini",
      ];
      const sobran = aBorrar(nombres);
      expect(sobran.every((n: string) => n.endsWith(".db.gz"))).toBe(true);
      expect(sobran).not.toContain("notas.txt");
      expect(sobran).not.toContain("ledger.db");
      expect(sobran).not.toContain("ledger-2026-08-01.db");
    });

    it("ignora una fecha con formato roto", () => {
      expect(aBorrar(["ledger-2026-8-1.db.gz"], { diarias: 0 })).toEqual([]);
    });
  });

  // El orden lo da el nombre, no el sistema de archivos: leer un directorio no
  // garantiza ningún orden concreto.
  it("da el mismo resultado venga como venga la lista", () => {
    const nombres = serie("2026-08-25", 25);
    const alDerecho = aBorrar(nombres).sort();
    const alReves = aBorrar([...nombres].reverse()).sort();
    expect(alDerecho).toEqual(alReves);
  });
});
