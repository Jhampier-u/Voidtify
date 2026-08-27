"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Miniatura from "./Miniatura";
import {
  rellenarGeneros,
  type ResultadoRelleno,
} from "@/lib/genre-fill-actions";
import type { EntradaEtiqueta } from "@/lib/stats/genres";

/** `84 K`, `1,2 M`. Los oyentes de Last.fm llegan a las decenas de millones. */
function compacta(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (n >= 1_000) return `${Math.round(n / 1000)} K`;
  return String(n);
}

/**
 * Reparto de etiquetas, por ejes y con cada una abrible.
 *
 * Las etiquetas de Last.fm no son un vocabulario de géneros: una de cada ocho
 * es una década, un país o un tipo de voz. Antes iban todas a la misma lista y
 * «female vocalists» ocupaba el puesto ocho, quitándoselo a un género. Ahora
 * cada eje va por su lado y los tres pequeños son contenido nuevo sin haber
 * pedido un solo dato más.
 *
 * Y cada género se abre: era una lista que no llevaba a ninguna parte.
 */
export default function GenrePanel({
  generos,
  epocas,
  procedencias,
  voces,
  analizados,
  conEtiquetas,
  sinEtiquetas,
  pendientes,
  imagenes,
  rangeParams,
}: {
  generos: EntradaEtiqueta[];
  epocas: EntradaEtiqueta[];
  procedencias: EntradaEtiqueta[];
  voces: EntradaEtiqueta[];
  analizados: number;
  conEtiquetas: number;
  sinEtiquetas: number;
  pendientes: number;
  /** Fotos por clave de artista, para la lista que se despliega. */
  imagenes: Record<string, string>;
  rangeParams: { preset?: string; desde?: string; hasta?: string };
}) {
  const [pendiente, startTransition] = useTransition();
  const [ultimo, setUltimo] = useState<ResultadoRelleno | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

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

  const restantes = ultimo?.restantes ?? pendientes;
  const max = Math.max(1, ...generos.map((g) => g.plays));

  if (generos.length === 0) {
    return (
      <section>
        <p className="label-mono text-mute mb-4">Géneros</p>
        <p className="font-serif italic text-cream-dim">
          Todavía no hay etiquetas. Se piden a Last.fm artista por artista,
          porque el campo de géneros de Spotify está deprecado y llega vacío.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="display-italic text-[clamp(1.8rem,4vw,3rem)]">
          De qué está hecho.
        </h2>
        <p className="dato-mono text-mute">
          {conEtiquetas.toLocaleString("es")} de tus{" "}
          {analizados.toLocaleString("es")} artistas más escuchados
        </p>
      </div>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <ul className="flex flex-col gap-1">
            {generos.map((g, i) => (
              <li key={g.name}>
                <button
                  type="button"
                  onClick={() => setAbierto(abierto === g.name ? null : g.name)}
                  aria-expanded={abierto === g.name}
                  className="group flex w-full items-center gap-3 rounded-lg px-1 py-1
                             text-left transition-colors duration-200 hover:bg-ink-2/40
                             outline-none focus-visible:ring-1 focus-visible:ring-acid"
                >
                  <span
                    className={`w-40 shrink-0 truncate transition-colors duration-200
                                group-hover:text-acid ${
                                  abierto === g.name ? "text-acid" : ""
                                }`}
                  >
                    {g.name}
                  </span>

                  <span className="h-3 flex-1 overflow-hidden rounded-full bg-ink-2">
                    <span
                      className={`block h-full rounded-full transition-[filter] duration-200
                                  group-hover:brightness-125 ${
                                    i === 0 ? "bg-acid" : "bg-cream-dim/35"
                                  }`}
                      style={{ width: `${(g.plays / max) * 100}%` }}
                    />
                  </span>

                  <span className="dato-mono num-tabular w-14 shrink-0 text-right text-cream-dim">
                    {(g.share * 100).toFixed(1)} %
                  </span>

                  {/* La mediana de oyentes en Last.fm dice si el género es de
                      nicho o de todo el mundo. Mediana y no media: un artista
                      enorme dentro de un género pequeño la haría mentir. */}
                  <span
                    className="dato-mono num-tabular w-20 shrink-0 text-right text-mute"
                    title={
                      g.oyentes === null
                        ? "sin datos de Last.fm"
                        : "mediana de oyentes en Last.fm de sus artistas"
                    }
                  >
                    {g.oyentes === null ? "—" : `${compacta(g.oyentes)} oy.`}
                  </span>
                </button>

                {abierto === g.name && (
                  <div className="mb-2 mt-1 rounded-xl bg-ink-2/40 p-4 ring-1 ring-rule">
                    <p className="dato-mono text-mute mb-3">
                      {g.artistas.toLocaleString("es")}{" "}
                      {g.artistas === 1 ? "artista tuyo" : "artistas tuyos"} ·{" "}
                      {g.plays.toLocaleString("es")} reproducciones
                    </p>

                    <ul className="flex flex-wrap gap-2">
                      {g.top.map((a) => (
                        <li key={a.key}>
                          <Link
                            href={`/escucha/artista/${encodeURIComponent(a.key)}`}
                            className="group/a flex items-center gap-2 rounded-full
                                       bg-ink py-1 pl-1 pr-3 ring-1 ring-rule
                                       transition-colors duration-200
                                       hover:ring-acid/50
                                       outline-none focus-visible:ring-acid"
                          >
                            <Miniatura
                              nombre={a.name}
                              url={imagenes[a.key]}
                              lado={26}
                              redondeo="rounded-full"
                            />
                            <span className="truncate transition-colors duration-200 group-hover/a:text-acid">
                              {a.name}
                            </span>
                            <span className="dato-mono num-tabular text-mute">
                              {a.plays}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
            {/* El botón solo aparece si hay algo que adelantar. Antes salía
                siempre y prometía resolver a artistas que ya estaban
                terminados: Last.fm simplemente no tiene etiquetas suyas. */}
            {restantes > 0 && (
              <button
                type="button"
                onClick={rellenar}
                disabled={pendiente}
                className="label-mono rounded-full border border-current px-5 py-2
                           transition-colors duration-200 hover:text-acid
                           disabled:opacity-50"
              >
                {pendiente ? "Preguntando…" : "Adelantar un lote"}
              </button>
            )}

            <p className="dato-mono text-mute">
              {restantes > 0 ? (
                <>
                  quedan {restantes.toLocaleString("es")} por consultar. Se hace
                  solo con cada captura; esto solo lo adelanta.
                </>
              ) : (
                <>todos consultados.</>
              )}
              {sinEtiquetas > 0 && (
                <>
                  {" "}
                  {sinEtiquetas.toLocaleString("es")}{" "}
                  {sinEtiquetas === 1
                    ? "artista no tiene"
                    : "artistas no tienen"}{" "}
                  ninguna etiqueta en Last.fm; eso no se puede arreglar
                  preguntando otra vez.
                </>
              )}
            </p>
          </div>

          {ultimo && (
            <p className="dato-mono text-mute mt-3">
              {ultimo.pedidos} consultados · {ultimo.conEtiquetas} con etiquetas ·{" "}
              {ultimo.sinEtiquetas} sin ninguna
            </p>
          )}
        </div>

        <aside className="flex flex-col gap-8">
          <Eje titulo="Épocas" entradas={epocas} />
          <Eje titulo="Procedencia" entradas={procedencias} />
          <Eje titulo="Voz" entradas={voces} />

          <p className="font-serif italic text-mute leading-relaxed">
            Cuántos de tus artistas llevan cada etiqueta. Estas tres no son
            géneros: son décadas, países y tipo de voz, y antes ensuciaban la
            lista de arriba. La mayoría de artistas no lleva ninguna, así que
            esto es un recuento, no un reparto.
          </p>
        </aside>
      </div>
    </section>
  );
}

/**
 * Uno de los ejes pequeños.
 *
 * Va con el número de artistas y una barra, sin porcentaje. Cualquier
 * porcentaje aquí necesita explicar su denominador para no mentir: sobre el
 * propio eje, «female vocalists» daba 96 % —en Last.fm nadie etiqueta la voz
 * masculina, se da por supuesta— y se leía como si el 96 % de la música la
 * tuviera; sobre todos los artistas daba 4 %, cierto pero mudo. Un recuento no
 * tiene ese problema: veinticuatro artistas son veinticuatro artistas.
 */
function Eje({
  titulo,
  entradas,
}: {
  titulo: string;
  entradas: EntradaEtiqueta[];
}) {
  if (entradas.length === 0) return null;

  const max = Math.max(1, ...entradas.map((e) => e.artistas));

  return (
    <div>
      <p className="label-mono text-mute mb-3">{titulo}</p>
      <ul className="flex flex-col gap-2">
        {entradas.map((e) => (
          <li
            key={e.name}
            className="group"
            title={`${e.plays.toLocaleString("es")} reproducciones`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-serif text-cream-dim">
                {e.name}
              </span>
              <span className="dato-mono num-tabular shrink-0 text-mute">
                {e.artistas.toLocaleString("es")}
              </span>
            </div>
            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-ink-2">
              <span
                className="block h-full rounded-full bg-cream-dim/30"
                style={{ width: `${(e.artistas / max) * 100}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
