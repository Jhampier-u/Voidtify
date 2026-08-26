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
          {entradas.map((e, i) => {
            const contenido = (
              <>
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-acid/10
                             transition-[background-color,filter] duration-200
                             group-hover:bg-acid/25"
                  style={{ width: `${(e.plays / max) * 100}%` }}
                />

                {/* Marca de posición: nace en el borde al entrar el ratón. Es
                    lo que ancla el movimiento a un sitio concreto en vez de
                    dejar la fila entera flotando. */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[2px] bg-acid
                             scale-y-0 group-hover:scale-y-100
                             transition-transform duration-200 origin-center"
                />

                <span className="relative flex items-baseline gap-3 min-w-0">
                  <span
                    className={`label-mono num-tabular transition-colors duration-200 ${
                      i === 0 ? "text-acid" : "text-mute group-hover:text-cream"
                    }`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="truncate transition-colors duration-200 group-hover:text-acid">
                    {e.name}
                    {e.artistName && (
                      <span className="text-mute"> · {e.artistName}</span>
                    )}
                  </span>
                </span>

                {/* `normal-case` a propósito: `label-mono` pone todo en
                    mayúsculas y convertía la «m» de minutos en «M», que junto a
                    52 reproducciones se lee como millones. */}
                <span
                  className="relative label-mono normal-case text-mute num-tabular
                             whitespace-nowrap transition-colors duration-200
                             group-hover:text-cream-dim"
                >
                  {e.plays.toLocaleString("es")}
                  <span className="text-rule"> / </span>
                  {duracion(e.ms)}
                </span>
              </>
            );

            // La fila entera desplaza 4 px y se separa del resto. El
            // desplazamiento va en `transform` y no en padding para no
            // recalcular el layout de la lista en cada movimiento del raton.
            const clases =
              "relative flex items-baseline justify-between gap-4 px-2 py-2.5 " +
              "hairline-b overflow-hidden group " +
              "transition-transform duration-200 ease-out " +
              "hover:translate-x-1 active:translate-x-0.5 " +
              "outline-none focus-visible:bg-acid/10";

            return (
              <li
                key={e.key}
                className="rise"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                {hrefBase ? (
                  // La fila completa es el area sensible. Antes solo lo era el
                  // texto del nombre: habia que apuntar a las letras para poder
                  // pulsar, y el resto de la fila no reaccionaba a nada.
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
