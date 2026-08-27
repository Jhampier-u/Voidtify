import Link from "next/link";
import { duracion } from "@/lib/formato";
import Miniatura from "./Miniatura";
import DestacadoTop from "./DestacadoTop";

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
 *
 * La jerarquía es la misma que en artistas —destacado, cuatro medianas, cinco
 * pequeñas— porque las tres columnas se ven a la vez. Con dos de ellas planas,
 * la fila del número uno de canciones pesaba lo mismo que la décima y el
 * conjunto volvía a leerse como una tabla de tres columnas.
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
  const hrefDe = (e: Entrada) =>
    hrefBase ? `${hrefBase}/${encodeURIComponent(e.key)}` : undefined;

  if (entradas.length === 0) {
    return (
      <section className="@container">
        <p className="label-mono text-mute mb-4">{titulo}</p>
        <p className="font-serif italic text-cream-dim">{vacio}</p>
      </section>
    );
  }

  const [primero, ...resto] = entradas;

  return (
    <section className="@container">
      <p className="label-mono text-mute mb-4">{titulo}</p>

      <DestacadoTop
        nombre={primero.name}
        subtitulo={primero.artistName}
        plays={primero.plays}
        ms={primero.ms}
        url={imagenes[primero.key]}
        href={hrefDe(primero)}
      />

      <ol className="mt-2 space-y-0.5">
        {resto.map((e, indice) => {
          const i = indice + 1;
          // Cuatro medianas y el resto pequeñas, igual que en artistas.
          const lado = indice < 4 ? 56 : 38;
          const retardo = indice < 4 ? 120 + indice * 50 : 320 + (indice - 4) * 40;
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
                className="relative label-mono num-tabular w-6 shrink-0 text-mute
                           transition-colors duration-200 group-hover:text-cream"
              >
                {String(i + 1).padStart(2, "0")}
              </span>

              <Miniatura nombre={e.name} url={imagenes[e.key]} lado={lado} />

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
              style={{ animationDelay: `${retardo}ms` }}
            >
              {hrefBase ? (
                <Link href={hrefDe(e)!} className={clases}>
                  {contenido}
                </Link>
              ) : (
                <div className={clases}>{contenido}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
