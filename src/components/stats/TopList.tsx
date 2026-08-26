import Link from "next/link";
import { duracion } from "@/lib/formato";

type Entrada = {
  key: string;
  name: string;
  plays: number;
  ms: number;
  artistName?: string;
};

/**
 * Ranking con la proporción dibujada detrás de cada fila.
 *
 * Los números solos no dicen si el primero arrasa o gana por poco. La barra de
 * fondo convierte la lista en un gráfico sin ocupar más sitio ni añadir un
 * elemento nuevo que leer.
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
}: {
  titulo: string;
  entradas: Entrada[];
  vacio: string;
  /** Si se pasa, cada fila enlaza a `${hrefBase}/${key}`. */
  hrefBase?: string;
}) {
  const max = Math.max(1, ...entradas.map((e) => e.plays));

  return (
    <section>
      <p className="label-mono text-mute mb-4">{titulo}</p>

      {entradas.length === 0 ? (
        <p className="font-serif italic text-cream-dim">{vacio}</p>
      ) : (
        <ol>
          {entradas.map((e, i) => (
            <li
              key={e.key}
              className="relative flex items-baseline justify-between gap-4 px-2 py-2.5 hairline-b overflow-hidden rise"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 bg-acid/10"
                style={{ width: `${(e.plays / max) * 100}%` }}
              />

              <span className="relative flex items-baseline gap-3 min-w-0">
                <span
                  className={`label-mono num-tabular ${
                    i === 0 ? "text-acid" : "text-mute"
                  }`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="truncate">
                  {hrefBase ? (
                    <Link
                      href={`${hrefBase}/${encodeURIComponent(e.key)}`}
                      className="hover:text-acid transition-colors"
                    >
                      {e.name}
                    </Link>
                  ) : (
                    e.name
                  )}
                  {e.artistName && (
                    <span className="text-mute"> · {e.artistName}</span>
                  )}
                </span>
              </span>

              {/* `normal-case` a propósito: `label-mono` pone todo en
                  mayúsculas y convertía la «m» de minutos en «M», que junto a
                  52 reproducciones se lee como millones. */}
              <span className="relative label-mono normal-case text-mute num-tabular whitespace-nowrap">
                {e.plays.toLocaleString("es")}
                <span className="text-rule"> / </span>
                {duracion(e.ms)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
