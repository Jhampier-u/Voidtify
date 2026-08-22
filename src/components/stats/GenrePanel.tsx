"use client";

import { useState, useTransition } from "react";
import {
  rellenarGeneros,
  type ResultadoRelleno,
} from "@/lib/genre-fill-actions";

type Genero = {
  name: string;
  plays: number;
  share: number;
  artistas: number;
};

/**
 * Reparto de géneros, con el relleno de la caché a la vista.
 *
 * Los géneros no vienen del dump ni de la API de Spotify —cuyo campo `genres`
 * está deprecado y llega vacío— sino de Last.fm, consultado artista a artista.
 * El vocabulario lo rellena sola la captura periódica, veinte artistas cada
 * veinte minutos y los más escuchados primero. El botón está para adelantar un
 * lote cuando se tiene prisa, no porque haga falta pulsarlo: cuando dependía de
 * eso, a las dos semanas había 40 artistas resueltos de 10.680.
 */
export default function GenrePanel({
  generos,
  conGeneros,
  sinGeneros,
  profundidad,
  rangeParams,
}: {
  generos: Genero[];
  conGeneros: number;
  sinGeneros: number;
  profundidad: number;
  rangeParams: { preset?: string; desde?: string; hasta?: string };
}) {
  const [pendiente, startTransition] = useTransition();
  const [ultimo, setUltimo] = useState<ResultadoRelleno | null>(null);

  const rellenar = () => {
    startTransition(async () => {
      setUltimo(
        await rellenarGeneros(
          rangeParams.preset,
          rangeParams.desde,
          rangeParams.hasta,
        ),
      );
    });
  };

  const restantes = ultimo?.restantes ?? sinGeneros;
  const max = Math.max(1, ...generos.map((g) => g.plays));

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4 mb-5 flex-wrap">
        <p className="label-mono text-mute">Géneros</p>
        <p className="label-mono text-mute">
          {conGeneros} de tus {profundidad} artistas más escuchados
        </p>
      </div>

      {generos.length === 0 ? (
        <p className="font-serif italic text-cream-dim mb-6">
          Todavía no hay géneros. Se piden a Last.fm artista por artista, porque
          el campo de géneros de Spotify está deprecado y llega vacío.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 mb-8">
          {generos.map((g, i) => (
            <li
              key={g.name}
              className="flex items-center gap-3 fade-in"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className="w-40 shrink-0 truncate">{g.name}</span>
              <span className="flex-1 h-3 bg-ink-2 overflow-hidden">
                <span
                  className={`block h-full ${i === 0 ? "bg-acid" : "bg-cream-dim/35"}`}
                  style={{ width: `${(g.plays / max) * 100}%` }}
                />
              </span>
              <span className="label-mono text-mute num-tabular w-16 text-right shrink-0">
                {(g.share * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      )}

      {restantes > 0 && (
        <div className="flex items-center gap-4 flex-wrap">
          <button
            type="button"
            onClick={rellenar}
            disabled={pendiente}
            className="label-mono border border-current px-4 py-2 disabled:opacity-50"
          >
            {pendiente ? "Consultando Last.fm…" : "Adelantar un lote"}
          </button>

          {ultimo ? (
            <span className="label-mono text-mute">
              {ultimo.conEtiquetas} con etiquetas · {ultimo.sinEtiquetas} sin
              ellas · quedan {ultimo.restantes}
            </span>
          ) : (
            <span className="label-mono text-mute">
              Quedan {restantes} por resolver. Se hace solo con cada captura;
              esto solo lo adelanta.
            </span>
          )}
        </div>
      )}

      <p className="label-mono text-mute mt-5">
        Aproximación: se compone sobre tus {profundidad} artistas más escuchados
        del rango, ponderando por reproducciones.
      </p>
    </section>
  );
}
