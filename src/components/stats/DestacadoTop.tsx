import Link from "next/link";
import { duracion } from "@/lib/formato";
import Miniatura from "./Miniatura";

/**
 * El número uno de un ranking, con el peso que merece.
 *
 * Lo comparten las tres columnas de la portada. Vivía dentro de `TopArtistas`,
 * así que canciones y álbumes empezaban por una fila igual que la décima y las
 * tres columnas volvían a leerse como una tabla, que es justo lo que el
 * destacado venía a evitar.
 *
 * El tamaño del título va en `cqi`, no en `vw`: las tres columnas no miden lo
 * mismo —artistas ocupa vez y media— y una medida ligada a la ventana daba el
 * mismo cuerpo de letra en la columna ancha y en la estrecha, donde no cabía.
 * Atado al contenedor, el estilo es el mismo y la escala la pone cada columna.
 */
export default function DestacadoTop({
  nombre,
  subtitulo,
  plays,
  ms,
  url,
  href,
}: {
  nombre: string;
  /** El artista, en canciones y álbumes. Los artistas no lo llevan. */
  subtitulo?: string;
  plays: number;
  ms: number;
  url?: string;
  href?: string;
}) {
  const clases =
    "group relative flex items-end gap-5 overflow-hidden rounded-2xl " +
    "bg-ink-2/40 p-5 ring-1 ring-rule " +
    "transition-[background-color,box-shadow] duration-300 " +
    "hover:bg-ink-2 hover:ring-acid/40 rise " +
    "outline-none focus-visible:ring-acid";

  const cuerpo = (
    <>
      {/* Halo detrás de la foto: da profundidad sin recurrir a una sombra, que
          sobre un fondo casi negro no se ve. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full
                   bg-acid/[0.06] blur-3xl transition-opacity duration-500
                   group-hover:bg-acid/[0.12]"
      />

      <Miniatura nombre={nombre} url={url} lado={104} redondeo="rounded-2xl" />

      <span className="relative min-w-0 flex-1">
        <span className="label-mono text-acid">01</span>

        {/* Dos líneas y no una: «Main Title (from Game of Thrones) — from
            House of the Dragon» cortado en la primera palabra no dice nada. */}
        {/* El interlineado va aquí y no en una clase: `.display` lo fija en
            0.92 y se declara después que las utilidades de Tailwind, así que
            un `leading-*` se pierde en la cascada sin avisar. A una línea daba
            igual; a dos, los descendentes se tocan. */}
        <span
          className="mt-1 block display line-clamp-2
                     transition-colors duration-200 group-hover:text-acid"
          style={{ fontSize: "clamp(1.5rem, 6.5cqi, 2.6rem)", lineHeight: 1.05 }}
        >
          {nombre}
        </span>

        {subtitulo && (
          <span className="mt-1.5 block truncate font-serif italic text-cream-dim">
            {subtitulo}
          </span>
        )}

        <span className="mt-2 block dato-mono text-mute num-tabular">
          {plays.toLocaleString("es")} reproducciones · {duracion(ms)}
        </span>
      </span>
    </>
  );

  if (!href) return <div className={clases}>{cuerpo}</div>;

  return (
    <Link href={href} className={clases}>
      {cuerpo}
    </Link>
  );
}
