import { describe, it, expect } from "vitest";
import { ImageResponse } from "next/og";
import fs from "node:fs/promises";
import path from "node:path";
import { DIBUJOS } from "@/lib/tarjetas/dibujos";
import { FORMATOS, TIPOS, esFormato, esTipo } from "@/lib/tarjetas/tipos";
import type { DatosTarjeta } from "@/lib/tarjetas/tipos";

/**
 * Un PNG de 1080 de ancho con contenido no baja de aqui ni siendo casi todo
 * fondo liso. Por debajo, el dibujo se ha quedado en nada.
 */
const MINIMO_BYTES = 2_000;

const entrada = (n: number) => ({
  nombre: `Artista ${n}`,
  plays: 60 - n * 5,
  ms: 600_000,
});

const DATOS: DatosTarjeta = {
  etiqueta: "Últimas 4 semanas",
  periodo: "2026-07-31 — 2026-08-27",
  horas: 87,
  reproducciones: 1375,
  artistas: 391,
  canciones: 900,
  racha: 12,
  rachaMaxima: 40,
  topArtistas: Array.from({ length: 11 }, (_, i) => entrada(i)),
  topCanciones: Array.from({ length: 10 }, (_, i) => entrada(i)),
  mosaico: [],
};

async function fuentes() {
  const dir = path.join(process.cwd(), "public", "fonts");
  const [serif, mono] = await Promise.all([
    fs.readFile(path.join(dir, "Fraunces.ttf")),
    fs.readFile(path.join(dir, "JetBrainsMono.ttf")),
  ]);
  return [
    { name: "Fraunces", data: serif, weight: 400 as const, style: "normal" as const },
    { name: "JetBrains", data: mono, weight: 400 as const, style: "normal" as const },
  ];
}

describe("las tarjetas", () => {
  // Sin imagenes a proposito: la red no debe decidir si una prueba pasa, y lo
  // que se comprueba aqui es que el dibujo no revienta ni sale vacio.
  it.each(TIPOS)("dibuja «%s» en los dos formatos", async (tipo) => {
    const fonts = await fuentes();
    for (const medidas of Object.values(FORMATOS)) {
      const png = Buffer.from(
        await new ImageResponse(DIBUJOS[tipo]({ datos: DATOS, medidas }) as never, {
          width: medidas.ancho,
          height: medidas.alto,
          fonts,
        }).arrayBuffer(),
      );
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect(png.length).toBeGreaterThan(MINIMO_BYTES);
    }
  }, 60_000);

  it("aguanta un rango sin nada", async () => {
    const vacio: DatosTarjeta = {
      ...DATOS,
      horas: 0, reproducciones: 0, artistas: 0, canciones: 0,
      racha: 0, rachaMaxima: 0,
      topArtistas: [], topCanciones: [], mosaico: [],
    };
    const fonts = await fuentes();
    for (const tipo of TIPOS) {
      const png = Buffer.from(
        await new ImageResponse(
          DIBUJOS[tipo]({ datos: vacio, medidas: FORMATOS.historia }) as never,
          { width: 1080, height: 1920, fonts },
        ).arrayBuffer(),
      );
      expect(png.subarray(1, 4).toString()).toBe("PNG");
    }
  }, 60_000);

  describe("los parametros de la url", () => {
    it("reconoce los tipos y rechaza lo demas", () => {
      expect(esTipo("cartel")).toBe(true);
      expect(esTipo("../secreto")).toBe(false);
    });

    it("reconoce los formatos y rechaza lo demas", () => {
      expect(esFormato("cuadrado")).toBe(true);
      expect(esFormato("gigante")).toBe(false);
    });
  });

  it("hay un dibujo para cada tipo", () => {
    expect(Object.keys(DIBUJOS).sort()).toEqual([...TIPOS].sort());
  });
});
