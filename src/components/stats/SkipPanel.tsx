type Stats = {
  conDatos: number;
  abandonadas: number;
  tasa: number;
  desde: string | null;
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
}: {
  stats: Stats;
  artistas: Artista[];
}) {
  if (stats.conDatos === 0) return null;

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
              <li
                key={a.key}
                className="relative flex items-baseline justify-between gap-4 px-2 py-2 hairline-b overflow-hidden rise"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-blood/15"
                  style={{ width: `${a.tasa * 100}%` }}
                />
                <span className="relative truncate">{a.name}</span>
                <span className="relative label-mono text-mute num-tabular whitespace-nowrap">
                  {pct(a.tasa)}
                  <span className="text-rule"> / </span>
                  {a.plays.toLocaleString("es")}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
