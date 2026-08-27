import Link from "next/link";
import { duracion, fechaLarga } from "@/lib/formato";

type Bucket = { date: string; plays: number; ms: number };

const CUANTOS = 5;

/**
 * Los días más intensos del rango, en lista.
 *
 * El calendario enseña el ritmo y los huecos, pero para saber *cuál* fue el día
 * grande había que ir comparando tonos de verde cuadrado a cuadrado. Esto lo
 * dice con nombre y cifra, y ocupa el ancho que al calendario le sobra en los
 * rangos cortos.
 */
export default function MejoresDias({
  buckets,
  anioActual,
}: {
  buckets: Bucket[];
  /** Para no repetir el año en cada fila cuando es el corriente. */
  anioActual: number;
}) {
  const mejores = [...buckets]
    .sort((a, b) => b.plays - a.plays || a.date.localeCompare(b.date))
    .slice(0, CUANTOS);

  if (mejores.length === 0) return null;

  const max = mejores[0].plays;

  return (
    <div>
      <p className="label-mono text-mute mb-4">Tus días más intensos</p>

      <ol className="space-y-0.5">
        {mejores.map((d, i) => (
          <li key={d.date}>
            <Link
              href={`/historial?desde=${d.date}&hasta=${d.date}`}
              className="group relative flex items-center gap-3 overflow-hidden
                         rounded-xl px-2 py-2
                         transition-[transform,background-color] duration-200
                         ease-out hover:translate-x-1 hover:bg-ink-2/50
                         outline-none focus-visible:ring-1 focus-visible:ring-acid"
            >
              <span
                aria-hidden
                className="absolute inset-y-1 left-0 rounded-r-full opacity-70
                           bg-gradient-to-r from-acid/25 via-acid/12 to-acid/[0.03]
                           transition-opacity duration-200 group-hover:opacity-100"
                style={{ width: `${(d.plays / max) * 100}%` }}
              />

              <span className="relative label-mono num-tabular w-6 shrink-0 text-mute
                               transition-colors duration-200 group-hover:text-cream">
                {String(i + 1).padStart(2, "0")}
              </span>

              <span className="relative min-w-0 flex-1 truncate font-serif
                               transition-colors duration-200 group-hover:text-acid">
                {fechaLarga(d.date, anioActual)}
              </span>

              <span className="relative shrink-0 text-right">
                <span className="block num-tabular font-mono text-sm text-cream-dim">
                  {d.plays.toLocaleString("es")}
                </span>
                <span className="block num-tabular font-mono text-[11px] text-mute">
                  {duracion(d.ms)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
