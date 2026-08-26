import Link from "next/link";
import { duracion } from "@/lib/formato";
import Miniatura from "./Miniatura";

type Entrada = { key: string; name: string; plays: number; ms: number };

/**
 * Ranking de artistas con foto y jerarquía.
 *
 * La lista plana anterior daba a las diez filas el mismo peso, y con tres
 * columnas idénticas al lado el resultado se leía como una tabla, no como un
 * top. Aquí el primero ocupa lo que merece, los cuatro siguientes llevan foto
 * mediana y el resto una pequeña: la misma información, con un recorrido para
 * el ojo.
 *
 * Las fotos llegan de `artist_imagen`, que la captura rellena por lotes. Que
 * falten es el estado normal durante los primeros días, así que el hueco tiene
 * que verse intencionado y no roto.
 */
export default function TopArtistas({
  entradas,
  imagenes,
  vacio,
}: {
  entradas: Entrada[];
  imagenes: Record<string, string>;
  vacio: string;
}) {
  const max = Math.max(1, ...entradas.map((e) => e.plays));

  if (entradas.length === 0) {
    return (
      <section>
        <p className="label-mono text-mute mb-4">Artistas</p>
        <p className="font-serif italic text-cream-dim">{vacio}</p>
      </section>
    );
  }

  const [primero, ...resto] = entradas;
  const medios = resto.slice(0, 4);
  const compactos = resto.slice(4);

  return (
    <section>
      <p className="label-mono text-mute mb-4">Artistas</p>

      <Destacado entrada={primero} url={imagenes[primero.key]} />

      <ul className="mt-2">
        {medios.map((e, i) => (
          <li
            key={e.key}
            className="rise"
            style={{ animationDelay: `${120 + i * 50}ms` }}
          >
            <Fila
              entrada={e}
              posicion={i + 2}
              url={imagenes[e.key]}
              max={max}
              lado={56}
            />
          </li>
        ))}
        {compactos.map((e, i) => (
          <li
            key={e.key}
            className="rise"
            style={{ animationDelay: `${320 + i * 40}ms` }}
          >
            <Fila
              entrada={e}
              posicion={i + 6}
              url={imagenes[e.key]}
              max={max}
              lado={38}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Destacado({ entrada, url }: { entrada: Entrada; url?: string }) {
  return (
    <Link
      href={`/escucha/artista/${encodeURIComponent(entrada.key)}`}
      className="group relative flex items-end gap-5 overflow-hidden rounded-2xl
                 bg-ink-2/40 p-5 ring-1 ring-rule
                 transition-[background-color,box-shadow] duration-300
                 hover:bg-ink-2 hover:ring-acid/40 rise"
    >
      {/* Halo detrás de la foto: da profundidad sin recurrir a una sombra, que
          sobre un fondo casi negro no se ve. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full
                   bg-acid/[0.06] blur-3xl transition-opacity duration-500
                   group-hover:bg-acid/[0.12]"
      />

      <Miniatura nombre={entrada.name} url={url} lado={104} redondeo="rounded-2xl" />

      <span className="relative min-w-0 flex-1">
        <span className="label-mono text-acid">01</span>
        <span
          className="mt-1 block truncate display text-[clamp(1.6rem,3vw,2.6rem)]
                     transition-colors duration-200 group-hover:text-acid"
        >
          {entrada.name}
        </span>
        <span className="mt-2 block label-mono normal-case text-mute num-tabular">
          {entrada.plays.toLocaleString("es")} reproducciones ·{" "}
          {duracion(entrada.ms)}
        </span>
      </span>
    </Link>
  );
}

function Fila({
  entrada,
  posicion,
  url,
  max,
  lado,
}: {
  entrada: Entrada;
  posicion: number;
  url?: string;
  max: number;
  lado: number;
}) {
  return (
    <Link
      href={`/escucha/artista/${encodeURIComponent(entrada.key)}`}
      className="group relative flex items-center gap-3 overflow-hidden rounded-xl
                 px-2 py-1.5 transition-[transform,background-color] duration-200
                 ease-out hover:translate-x-1 hover:bg-ink-2/50"
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-0 rounded-r-full opacity-70
                   bg-gradient-to-r from-acid/25 via-acid/12 to-acid/[0.03]
                   transition-opacity duration-200 group-hover:opacity-100"
        style={{ width: `${(entrada.plays / max) * 100}%` }}
      />

      <span className="relative label-mono num-tabular w-6 shrink-0 text-mute
                       transition-colors duration-200 group-hover:text-cream">
        {String(posicion).padStart(2, "0")}
      </span>

      <Miniatura nombre={entrada.name} url={url} lado={lado} />

      <span className="relative min-w-0 flex-1 truncate font-serif
                       transition-colors duration-200 group-hover:text-acid">
        {entrada.name}
      </span>

      <span className="relative shrink-0 text-right">
        <span className="block num-tabular font-mono text-sm text-cream-dim">
          {entrada.plays.toLocaleString("es")}
        </span>
        <span className="block num-tabular font-mono text-[11px] text-mute">
          {duracion(entrada.ms)}
        </span>
      </span>
    </Link>
  );
}
