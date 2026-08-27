import fs from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { auth } from "@/auth";
import { db } from "@/db";
import { parseRange } from "@/lib/stats/range";
import { resolveTimeZone, localParts } from "@/lib/stats/local-time";
import { datosDeTarjeta } from "@/lib/tarjetas/datos";
import { DIBUJOS } from "@/lib/tarjetas/dibujos";
import { esFormato, esTipo, FORMATOS } from "@/lib/tarjetas/tipos";

export const dynamic = "force-dynamic";

/**
 * Las fuentes se leen del disco, no del CSS.
 *
 * `ImageResponse` renderiza fuera del navegador: no hay hoja de estilos ni
 * `next/font` que valga, solo búferes. Y solo admite ttf, otf o woff — los
 * woff2 que genera `next/font` no sirven, de ahí la copia en `public/fonts`.
 *
 * Se cachean en memoria: leer 500 KB de disco en cada petición sería tonto.
 */
let fuentesCache: { serif: Buffer; mono: Buffer } | null = null;

async function fuentes() {
  if (fuentesCache) return fuentesCache;
  const dir = path.join(process.cwd(), "public", "fonts");
  const [serif, mono] = await Promise.all([
    fs.readFile(path.join(dir, "Fraunces.ttf")),
    fs.readFile(path.join(dir, "JetBrainsMono.ttf")),
  ]);
  fuentesCache = { serif, mono };
  return fuentesCache;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tipo: string }> },
) {
  const session = await auth();
  if (!session) return new Response("No autorizado", { status: 401 });

  const { tipo } = await params;
  if (!esTipo(tipo)) return new Response("Tipo desconocido", { status: 404 });

  const url = new URL(request.url);
  const pedido = url.searchParams.get("formato") ?? "historia";
  const formato = esFormato(pedido) ? pedido : "historia";

  const timeZone = resolveTimeZone(process.env);
  const ahora = Date.now();
  const range = parseRange(
    {
      preset: url.searchParams.get("preset") ?? undefined,
      desde: url.searchParams.get("desde") ?? undefined,
      hasta: url.searchParams.get("hasta") ?? undefined,
    },
    ahora,
    timeZone,
  );

  const datos = await datosDeTarjeta(
    db,
    range,
    localParts(ahora, timeZone).localDate,
  );

  const medidas = FORMATOS[formato];
  const { serif, mono } = await fuentes();
  const Dibujo = DIBUJOS[tipo];

  return new ImageResponse(<Dibujo datos={datos} medidas={medidas} />, {
    width: medidas.ancho,
    height: medidas.alto,
    fonts: [
      { name: "Fraunces", data: serif, weight: 400 as const, style: "normal" as const },
      { name: "JetBrains", data: mono, weight: 400 as const, style: "normal" as const },
    ],
  });
}
