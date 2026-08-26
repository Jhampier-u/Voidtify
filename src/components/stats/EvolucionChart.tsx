"use client";

import { useState } from "react";
import type { Serie } from "@/lib/stats/serie";

const ANCHO = 720;
const ALTO = 160;
const MARGEN = 12;

/**
 * Evolución en el tiempo, por días o por meses según lo que quepa.
 *
 * Se dibuja a mano en SVG: para una serie de una sola dimensión son dos rutas,
 * y una librería de gráficas costaría más de lo que aporta —cien kilobytes y
 * pelearse con sus estilos por defecto.
 *
 * Antes era siempre mensual, y con el rango de cuatro semanas eso son dos
 * puntos: un segmento recto que sugería un crecimiento continuo que nunca
 * ocurrió. La granularidad la decide `construirSerie`.
 */
export default function EvolucionChart({
  serie,
  titulo = "Evolución",
}: {
  serie: Serie;
  titulo?: string;
}) {
  const [activo, setActivo] = useState<number | null>(null);
  const { puntos, granularidad } = serie;

  if (puntos.length === 0) return null;

  const max = Math.max(1, ...puntos.map((p) => p.plays));
  const pico = puntos.reduce((a, b) => (b.plays > a.plays ? b : a), puntos[0]);
  const util = ALTO - MARGEN * 2;

  const y = (plays: number) => MARGEN + util - (plays / max) * util;
  const x = (i: number) =>
    puntos.length === 1 ? ANCHO / 2 : (i / (puntos.length - 1)) * ANCHO;

  const coords = puntos.map((p, i) => `${x(i)},${y(p.plays)}`).join(" ");
  const area = `M0,${ALTO} L${coords.replaceAll(" ", " L")} L${ANCHO},${ALTO} Z`;

  const p = activo === null ? null : puntos[activo];

  /**
   * El índice se saca de la posición relativa dentro del recuadro, no de las
   * coordenadas del SVG: el `viewBox` se estira con `preserveAspectRatio` y las
   * unidades internas no corresponden con los píxeles de pantalla.
   */
  const alMover = (e: React.MouseEvent<HTMLDivElement>) => {
    const caja = e.currentTarget.getBoundingClientRect();
    const razon = (e.clientX - caja.left) / caja.width;
    const i = Math.round(razon * (puntos.length - 1));
    setActivo(Math.min(puntos.length - 1, Math.max(0, i)));
  };

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <p className="label-mono text-mute">
          {titulo}
          <span className="text-rule"> · </span>
          {granularidad === "dia" ? "por días" : "por meses"}
        </p>
        <p className="label-mono normal-case text-mute">
          pico · <span className="text-acid">{pico.etiqueta}</span> ·{" "}
          {pico.plays.toLocaleString("es")}
        </p>
      </div>

      <div
        className="relative"
        onMouseMove={alMover}
        onMouseLeave={() => setActivo(null)}
      >
        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          preserveAspectRatio="none"
          className="h-[160px] w-full"
          role="img"
          aria-label={`Reproducciones ${
            granularidad === "dia" ? "por día" : "por mes"
          }. Máximo en ${pico.etiqueta}, ${pico.plays}.`}
        >
          {/* El área se revela de izquierda a derecha con un rectángulo que
              crece: animar la ruta entera no es posible en CSS. */}
          <clipPath id="revelado">
            <rect x="0" y="0" width={ANCHO} height={ALTO} className="revelar" />
          </clipPath>

          <g clipPath="url(#revelado)">
            <path d={area} className="fill-acid/12" />
            <polyline
              points={coords}
              className="fill-none stroke-acid"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </g>

          {p && (
            <line
              x1={x(activo!)}
              y1={0}
              x2={x(activo!)}
              y2={ALTO}
              className="stroke-acid/40"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Con muchos días, un círculo por punto es ruido: solo se marcan el
              pico y el que se está señalando. */}
          <circle
            cx={x(puntos.indexOf(pico))}
            cy={y(pico.plays)}
            r={3.5}
            className="fill-acid"
            vectorEffect="non-scaling-stroke"
          />
          {p && (
            <circle
              cx={x(activo!)}
              cy={y(p.plays)}
              r={4}
              className="fill-cream stroke-ink"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {p && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2
                       -translate-y-full whitespace-nowrap rounded-lg bg-ink-2
                       px-3 py-2 ring-1 ring-rule"
            style={{ left: `${(activo! / Math.max(1, puntos.length - 1)) * 100}%` }}
          >
            <span className="label-mono normal-case text-mute">{p.etiqueta}</span>
            <span className="num-tabular ml-2 font-mono text-sm text-acid">
              {p.plays.toLocaleString("es")}
            </span>
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between">
        <span className="label-mono normal-case text-mute">
          {puntos[0].etiqueta}
        </span>
        <span className="label-mono normal-case text-mute">
          {puntos[puntos.length - 1].etiqueta}
        </span>
      </div>
    </section>
  );
}
