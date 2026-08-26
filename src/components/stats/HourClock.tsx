"use client";

import { useState } from "react";

type Bucket = { hour: number; plays: number; ms: number };

const TAMANO = 260;
const CENTRO = TAMANO / 2;
const RADIO_INTERIOR = 46;
const RADIO_EXTERIOR = 112;

/** 0h arriba: se resta un cuarto de vuelta al ángulo. */
function punto(hora: number, radio: number) {
  const angulo = (hora / 24) * Math.PI * 2 - Math.PI / 2;
  return {
    x: CENTRO + Math.cos(angulo) * radio,
    y: CENTRO + Math.sin(angulo) * radio,
  };
}

/**
 * Las 24 horas del día como radios de un reloj.
 *
 * Un histograma de barras obliga a leer el eje para entender que las 3 de la
 * madrugada están al lado de las 23:00. En un círculo esa continuidad es
 * evidente: la madrugada y la noche se tocan, que es como funciona un día.
 *
 * El centro muestra tu hora punta, y la hora que señalas cuando señalas alguna.
 * Así el dato de cada radio se lee sin sacar una etiqueta flotante que tape la
 * esfera.
 */
export default function HourClock({ buckets }: { buckets: Bucket[] }) {
  const [activa, setActiva] = useState<number | null>(null);

  const max = Math.max(1, ...buckets.map((b) => b.plays));
  const pico = buckets.reduce((a, b) => (b.plays > a.plays ? b : a), buckets[0]);
  const total = buckets.reduce((n, b) => n + b.plays, 0);

  const mostrada =
    activa === null ? pico : (buckets.find((b) => b.hour === activa) ?? pico);

  return (
    <figure className="flex flex-col items-center gap-4">
      <svg
        viewBox={`0 0 ${TAMANO} ${TAMANO}`}
        className="w-full max-w-[260px]"
        role="img"
        aria-label={`Reproducciones por hora del día. Máximo a las ${pico.hour}h.`}
        onMouseLeave={() => setActiva(null)}
      >
        <circle
          cx={CENTRO}
          cy={CENTRO}
          r={RADIO_EXTERIOR}
          className="fill-none stroke-rule"
          strokeWidth={1}
        />
        <circle
          cx={CENTRO}
          cy={CENTRO}
          r={RADIO_INTERIOR}
          className="fill-none stroke-rule"
          strokeWidth={1}
        />

        {buckets.map((b) => {
          const largo =
            RADIO_INTERIOR +
            (b.plays / max) * (RADIO_EXTERIOR - RADIO_INTERIOR);
          const a = punto(b.hour, RADIO_INTERIOR);
          const z = punto(b.hour, Math.max(RADIO_INTERIOR + 1.5, largo));
          const esPico = b.hour === pico.hour && b.plays > 0;
          const señalada = b.hour === activa;

          // Longitud real del radio, que es lo que necesita el trazo
          // discontinuo para crecer desde dentro hacia fuera.
          const longitud = Math.hypot(z.x - a.x, z.y - a.y);

          return (
            <g key={b.hour}>
              <line
                x1={a.x}
                y1={a.y}
                x2={z.x}
                y2={z.y}
                strokeWidth={señalada ? 9 : 7}
                strokeLinecap="round"
                className={`radio transition-[stroke-width] duration-150 ${
                  señalada || esPico ? "stroke-acid" : "stroke-cream-dim"
                }`}
                style={
                  {
                    "--largo": longitud,
                    animationDelay: `${b.hour * 22}ms`,
                    opacity: señalada
                      ? 1
                      : esPico
                        ? 1
                        : 0.28 + (b.plays / max) * 0.5,
                  } as React.CSSProperties
                }
              />
              {/* Radio invisible y ancho, solo para el ratón: apuntar a siete
                  píxeles inclinados es incómodo, y el area sensible llega
                  hasta el borde para que no haya huecos muertos. */}
              <line
                x1={punto(b.hour, RADIO_INTERIOR - 6).x}
                y1={punto(b.hour, RADIO_INTERIOR - 6).y}
                x2={punto(b.hour, RADIO_EXTERIOR + 4).x}
                y2={punto(b.hour, RADIO_EXTERIOR + 4).y}
                strokeWidth={16}
                stroke="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setActiva(b.hour)}
              />
            </g>
          );
        })}

        {[0, 6, 12, 18].map((h) => {
          const p = punto(h, RADIO_EXTERIOR + 14);
          return (
            <text
              key={h}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-mute font-mono"
              style={{ fontSize: 9, letterSpacing: "0.1em" }}
            >
              {String(h).padStart(2, "0")}
            </text>
          );
        })}

        {total > 0 && (
          <>
            <text
              x={CENTRO}
              y={CENTRO - 4}
              textAnchor="middle"
              className="fill-acid num-tabular"
              style={{ fontSize: 26, fontWeight: 600 }}
            >
              {String(mostrada.hour).padStart(2, "0")}
            </text>
            <text
              x={CENTRO}
              y={CENTRO + 12}
              textAnchor="middle"
              className="fill-mute font-mono"
              style={{ fontSize: 7, letterSpacing: "0.14em" }}
            >
              {activa === null
                ? "TU HORA"
                : `${mostrada.plays.toLocaleString("es")} VECES`}
            </text>
          </>
        )}
      </svg>
    </figure>
  );
}
