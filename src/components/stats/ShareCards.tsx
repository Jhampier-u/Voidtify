"use client";

import { useState } from "react";
import type { StatsRange } from "@/lib/stats/range";
import { FORMATOS, type NombreFormato } from "@/lib/tarjetas/tipos";

const TARJETAS = [
  { tipo: "cartel", label: "Cartel", nota: "tus artistas como cartel de festival" },
  { tipo: "resumen", label: "Resumen", nota: "las horas, sobre tus carátulas" },
  { tipo: "top-artistas", label: "Top artistas", nota: "los cinco, con su foto" },
  { tipo: "racha", label: "Racha", nota: "días seguidos con música" },
] as const;

const NOMBRES: Record<NombreFormato, string> = {
  historia: "Historia 9:16",
  cuadrado: "Cuadrado 1:1",
};

/**
 * Las tarjetas para compartir, con vista previa.
 *
 * Antes eran cuatro enlaces de descarga a ciegas: pulsabas y te bajabas un PNG
 * sin haberlo visto nunca. Eso no era solo incómodo de usar — es la razón de
 * que las tarjetas fueran tipografía sobre negro durante meses, porque quien
 * las hacía tampoco las veía.
 *
 * La previa es la misma ruta que la descarga, así que lo que se ve es
 * exactamente el archivo que se guarda.
 */
export default function ShareCards({ range }: { range: StatsRange }) {
  const [tipo, setTipo] = useState<string>(TARJETAS[0].tipo);
  const [formato, setFormato] = useState<NombreFormato>("historia");

  const query = new URLSearchParams();
  if (range.preset === "custom") {
    query.set("desde", range.fromDate);
    query.set("hasta", range.toDate);
  } else {
    query.set("preset", range.preset);
  }
  query.set("formato", formato);

  const src = `/api/card/${tipo}?${query}`;
  const medidas = FORMATOS[formato];
  const elegida = TARJETAS.find((t) => t.tipo === tipo)!;

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="display-italic text-[clamp(1.8rem,4vw,3rem)]">
          Para enseñarlo.
        </h2>
        <div className="flex gap-2">
          {(Object.keys(FORMATOS) as NombreFormato[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormato(f)}
              className={`label-mono rounded-full border px-4 py-1.5
                          transition-colors duration-200 ${
                            formato === f
                              ? "border-acid text-acid"
                              : "border-rule text-mute hover:text-cream"
                          }`}
            >
              {NOMBRES[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        <ul className="flex flex-col gap-1">
          {TARJETAS.map((t) => (
            <li key={t.tipo}>
              <button
                type="button"
                onClick={() => setTipo(t.tipo)}
                className={`flex w-full flex-col gap-1 rounded-xl px-4 py-3 text-left
                            transition-colors duration-200
                            outline-none focus-visible:ring-1 focus-visible:ring-acid ${
                              tipo === t.tipo
                                ? "bg-ink-2 ring-1 ring-acid/40"
                                : "hover:bg-ink-2/50"
                            }`}
              >
                <span
                  className={`label-mono ${
                    tipo === t.tipo ? "text-acid" : "text-mute"
                  }`}
                >
                  {t.label}
                </span>
                <span className="font-serif italic text-cream-dim">{t.nota}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="flex flex-col items-start gap-4">
          {/* Sin `next/image`: el optimizador cachearía la tarjeta y al cambiar
              de rango seguiría enseñando la anterior. La clave fuerza además
              que el navegador rehaga la petición al cambiar de tipo. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={src}
            src={src}
            alt={`Tarjeta de ${elegida.label}`}
            width={medidas.ancho}
            height={medidas.alto}
            className="w-full max-w-[420px] rounded-xl ring-1 ring-rule"
          />

          <a
            href={src}
            download={`voidtify-${tipo}-${formato}.png`}
            className="label-mono rounded-full border border-current px-5 py-2
                       transition-colors duration-200 hover:text-acid"
          >
            Descargar {medidas.ancho}×{medidas.alto} ↓
          </a>
        </div>
      </div>
    </section>
  );
}
