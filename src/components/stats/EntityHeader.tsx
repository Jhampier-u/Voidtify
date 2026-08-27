import Link from "next/link";
import Miniatura from "./Miniatura";

type Tile = { label: string; valor: string };

/**
 * Cabecera común a las fichas de artista, canción y álbum.
 *
 * Las tres muestran lo mismo —posición, título, y cuatro cifras— y solo
 * cambian el subtítulo y de dónde vienen los datos. Tenerlo una vez evita que
 * las tres se separen visualmente con el tiempo.
 */
export default function EntityHeader({
  posicion,
  contexto,
  titulo,
  subtitulo,
  subtituloHref,
  imagen,
  tiles,
}: {
  posicion: number | null;
  contexto: string;
  titulo: string;
  subtitulo?: string;
  subtituloHref?: string;
  /** Carátula o foto. Si falta, la miniatura pone las iniciales. */
  imagen?: string;
  tiles: Tile[];
}) {
  // La consulta de ranking mira los 1000 primeros; más allá no se conoce.
  const puesto = posicion === null ? "fuera del top 1000" : `#${posicion}`;

  return (
    <>
      <section className="relative overflow-hidden px-5 sm:px-8 pt-16 pb-12 hairline-b">
        {/* Halo detras de la caratula: da profundidad sin recurrir a una
            sombra, que sobre un fondo casi negro no se ve. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 h-96 w-96
                     rounded-full bg-acid/[0.05] blur-3xl"
        />

        <div className="relative flex items-end gap-8 flex-wrap">
          <div className="rise">
            <Miniatura
              nombre={titulo}
              url={imagen}
              lado={168}
              redondeo="rounded-3xl"
            />
          </div>

          <div className="min-w-0 flex-1 rise" style={{ animationDelay: "80ms" }}>
            <p className="label-mono text-acid mb-5">
              {puesto} en tu ranking · {contexto}
            </p>

            <h1
              className="display-italic text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.9] break-words"
              style={{ fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 1' }}
            >
              {titulo}
            </h1>

            {subtitulo && (
              <p className="font-serif italic text-xl text-cream-dim mt-4">
                {subtituloHref ? (
                  <Link
                    href={subtituloHref}
                    className="hover:text-acid transition-colors"
                  >
                    {subtitulo}
                  </Link>
                ) : (
                  subtitulo
                )}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="hairline-b">
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-rule">
          {tiles.map((t, i) => (
            <div
              key={t.label}
              className="bg-ink px-5 py-6 rise"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <dt className="label-mono text-mute mb-3">{t.label}</dt>
              <dd className="num-tabular text-[clamp(1.2rem,2.4vw,1.7rem)] leading-tight">
                {t.valor}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
