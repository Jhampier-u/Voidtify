type Bucket = { weekday: number; plays: number; ms: number };

/** El índice 0 es lunes: así se lee una semana, y así lo devuelve `getByWeekday`. */
const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

/**
 * Reparto por día de la semana, en barras horizontales.
 *
 * Horizontal y no vertical porque las etiquetas son palabras, no números: en
 * vertical habría que girarlas o abreviarlas hasta que dejaran de leerse.
 */
export default function WeekdayBars({ buckets }: { buckets: Bucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.plays));
  const total = buckets.reduce((n, b) => n + b.plays, 0);
  const pico = buckets.reduce((a, b) => (b.plays > a.plays ? b : a), buckets[0]);

  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <p className="label-mono text-mute">Por día de la semana</p>
        {total > 0 && (
          <p className="label-mono text-mute">
            tu día · <span className="text-acid">{DIAS[pico.weekday]}</span>
          </p>
        )}
      </div>

      <ul className="flex flex-col gap-1.5">
        {buckets.map((b, i) => (
          <li
            key={b.weekday}
            className="flex items-center gap-3 rise"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className="label-mono text-mute w-8 shrink-0">
              {DIAS[b.weekday]}
            </span>
            <span className="flex-1 h-3 bg-ink-2 overflow-hidden">
              <span
                className={`block h-full ${
                  b.weekday === pico.weekday && b.plays > 0
                    ? "bg-acid"
                    : "bg-cream-dim/35"
                }`}
                style={{ width: `${(b.plays / max) * 100}%` }}
              />
            </span>
            <span className="label-mono text-mute num-tabular w-14 text-right shrink-0">
              {b.plays.toLocaleString("es")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
