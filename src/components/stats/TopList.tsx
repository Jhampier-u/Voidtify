import Link from "next/link";
import { duracion } from "@/lib/formato";
import Miniatura from "./Miniatura";

type Entrada = {
  key: string;
  name: string;
  plays: number;
  ms: number;
  artistName?: string;
};

/**
 * Ranking con miniatura y la proporción dibujada detrás de cada fila.
 *
 * Los números solos no dicen si el primero arrasa o gana por poco. La barra de
 * fondo convierte la lista en un gráfico sin ocupar más sitio ni añadir un
 * elemento nuevo que leer.
 *
 * La barra va con los extremos redondeados y separada del borde de la fila. De
 * lado a lado y con esquina viva se leía como un bloque de color y hacía que
 * toda la sección pareciera una tabla; como pastilla se lee como lo que es, una
 * magnitud.
 *
 * Se muestran siempre reproducciones y minutos: un artista de temas largos
 * ordena distinto según cuál se mire, y enseñar solo uno dejaría al lector sin
 * poder explicarse el orden que está viendo.
 */
export default function TopList({
  titulo,
  entradas,
  vacio,
  hrefBase,
  imagenes = {},
}: {
  titulo: string;
  entradas: Entrada[];
  vacio: string;
  /** Si se pasa, cada fila enlaza a `${hrefBase}/${key}`. */
  hrefBase?: string;
  /** Carátulas por clave. Las que falten muestran iniciales. */
  imagenes?: Record<string, string>;
}) {
  const max = Math.max(1, ...entradas.map((e) => e.plays));

  return (
    <section>
      <p className="label-mono text-mute mb-4">{titulo}</p>

      {entradas.length === 0 ? (
        <p className="font-serif italic text-cream-dim">{vacio}</p>
      ) : (
        <ol className="space-y-0.5">
          {entradas.map((e, i) => {
            const contenido = (
              <>
                {/* Pastilla con degradado: termina difuminada en vez de
                    cortarse en seco, que es lo que la hacía parecer un bloque. */}
                <span
                  aria-hidden
                  className="absolute inset-y-1 left-0 rounded-r-full
                             bg-gradient-to-r from-acid/25 via-acid/12 to-acid/[0.03]
                             transition-opacity duration-200
                             opacity-70 group-hover:opacity-100"
                  style={{ width: `${(e.plays / max) * 100}%` }}
                />

                <span
                  className={`relative label-mono num-tabular w-6 shrink-0
                              transition-colors duration-200 ${
                                i === 0
                                  ? "text-acid"
                                  : "text-mute group-hover:text-cream"
                              }`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>

                <Miniatura nombre={e.name} url={imagenes[e.key]} lado={38} />

                <span className="relative min-w-0 flex-1">
                  <span className="block truncate transition-colors duration-200 group-hover:text-acid">
                    {e.name}
                  </span>
                  {e.artistName && (
                    <span className="block truncate font-mono text-[11px] text-mute">
                      {e.artistName}
                    </span>
                  )}
                </span>

                {/* `normal-case`: `label-mono` pone todo en mayúsculas y
                    convertía la «m» de minutos en «M», que junto a 52
                    reproducciones se lee como millones. */}
                <span className="relative shrink-0 text-right">
                  <span className="block num-tabular font-mono text-sm text-cream-dim">
                    {e.plays.toLocaleString("es")}
                  </span>
                  <span className="block num-tabular font-mono text-[11px] text-mute">
                    {duracion(e.ms)}
                  </span>
                </span>
              </>
            );

            // El desplazamiento va en `transform` y no en padding: mover el
            // padding recalcularía el layout de la lista entera en cada
            // movimiento del ratón.
            const clases =
              "group relative flex items-center gap-3 rounded-xl px-2 py-1.5 " +
              "overflow-hidden transition-[transform,background-color] duration-200 " +
              "ease-out hover:translate-x-1 hover:bg-ink-2/50 " +
              "outline-none focus-visible:ring-1 focus-visible:ring-acid";

            return (
              <li
                key={e.key}
                className="rise"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                {hrefBase ? (
                  <Link
                    href={`${hrefBase}/${encodeURIComponent(e.key)}`}
                    className={clases}
                  >
                    {contenido}
                  </Link>
                ) : (
                  <div className={clases}>{contenido}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
