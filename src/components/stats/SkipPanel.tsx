import Link from "next/link";
import Miniatura from "./Miniatura";
type Stats = {
  conDatos: number;
  abandonadas: number;
  tasa: number;
  desde: string | null;
  hastaEnArchivo: string | null;
};

type Artista = {
  key: string;
  name: string;
  plays: number;
  abandonadas: number;
  tasa: number;
};

/**
 * Tasa de abandono, calculada solo sobre el historial importado.
 *
 * Se dice explícitamente desde cuándo hay datos: la API de Spotify no informa
 * de si una canción se saltó, así que lo capturado en vivo queda fuera del
 * cálculo. Un porcentaje sin esa nota parecería cubrir todo el historial.
 */
export default function SkipPanel({
  stats,
  artistas,
  imagenes = {},
}: {
  stats: Stats;
  artistas: Artista[];
  /** Fotos por clave de artista. Las que falten muestran iniciales. */
  imagenes?: Record<string, string>;
}) {
  // El abandono solo llega en el volcado, que termina el dia en que se pidio:
  // cualquier rango posterior no tiene ni una fila. Desaparecer sin mas hacia
  // que la seccion se esfumara de la portada sin explicacion, que parece un
  // fallo. Si nunca hubo volcado no hay nada que contar y si se calla.
  if (stats.conDatos === 0) {
    if (!stats.hastaEnArchivo) return null;

    return (
      <section>
        <p className="label-mono text-mute mb-4">Abandono</p>
        <p className="font-serif italic text-cream-dim max-w-xl">
          En este rango no hay datos de abandono. Spotify no dice si saltaste
          una canción: eso solo viene en el volcado de tu historial, y el tuyo
          termina el {stats.hastaEnArchivo}.
        </p>
        <p className="label-mono text-mute mt-3">
          Elige un rango anterior a esa fecha, o pide un volcado nuevo.
        </p>
      </section>
    );
  }

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-10">
      <div>
        <p className="label-mono text-mute mb-4">Abandono</p>
        <p
          className="display num-tabular text-[clamp(2.6rem,7vw,5rem)] text-acid leading-none"
          style={{ fontVariationSettings: '"opsz" 96, "WONK" 1' }}
        >
          {pct(stats.tasa)}
        </p>
        <p className="font-serif italic text-cream-dim mt-4">
          de tus escuchas las saltas antes de que acaben
        </p>
        <p className="label-mono text-mute mt-3">
          {stats.abandonadas.toLocaleString("es")} de{" "}
          {stats.conDatos.toLocaleString("es")} · datos desde {stats.desde}
        </p>
      </div>

      <div className="lg:col-span-2">
        <p className="label-mono text-mute mb-4">
          Artistas que más saltas
          <span className="text-mute"> · mínimo 20 escuchas</span>
        </p>

        {artistas.length === 0 ? (
          <p className="font-serif italic text-cream-dim">
            Ningún artista llega al mínimo en este rango.
          </p>
        ) : (
          <ol>
            {artistas.map((a, i) => (
              <li key={a.key} className="rise" style={{ animationDelay: `${i * 40}ms` }}>
                <Link
                  href={`/escucha/artista/${encodeURIComponent(a.key)}`}
                  className="group relative flex items-center justify-between gap-3
                             overflow-hidden rounded-xl px-2 py-1.5
                             transition-[transform,background-color] duration-200
                             ease-out hover:translate-x-1 hover:bg-ink-2/50"
                >
                  {/* Rojo y no verde: aqui la barra larga es lo malo. Y en
                      pastilla, como el resto, para que se lea como magnitud y
                      no como bloque de color. */}
                  <span
                    aria-hidden
                    className="absolute inset-y-1 left-0 rounded-r-full opacity-80
                               bg-gradient-to-r from-blood/30 via-blood/15 to-blood/[0.04]
                               transition-opacity duration-200 group-hover:opacity-100"
                    style={{ width: `${a.tasa * 100}%` }}
                  />

                  <span className="relative flex min-w-0 items-center gap-3">
                    <Miniatura nombre={a.name} url={imagenes[a.key]} lado={34} />
                    <span className="truncate transition-colors duration-200 group-hover:text-acid">
                      {a.name}
                    </span>
                  </span>

                  <span className="relative shrink-0 text-right">
                    <span className="block num-tabular font-mono text-sm text-cream-dim">
                      {pct(a.tasa)}
                    </span>
                    <span className="block num-tabular font-mono text-[11px] text-mute">
                      de {a.plays.toLocaleString("es")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
