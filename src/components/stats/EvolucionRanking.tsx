import Link from "next/link";
import Miniatura from "./Miniatura";
import { CambioDePuesto } from "./Cambio";
import type { Evolucion } from "@/lib/stats/evolucion-spotify";

const ANCHO = 120;
const ALTO = 26;

/**
 * Puestos a lo largo de las tomas, como línea diminuta.
 *
 * El eje va invertido: el puesto 1 arriba. Es lo que espera cualquiera que
 * mire un ranking, y dibujarlo al derecho haría que subir pareciera caer.
 *
 * Los tramos se cortan donde falta el dato. Unir por encima de un hueco
 * dibujaría una caída y una recuperación que nadie vivió.
 */
function Linea({ posiciones }: { posiciones: (number | null)[] }) {
  const conocidas = posiciones.filter((p): p is number => p !== null);
  if (conocidas.length < 2)
    return <span className="hidden w-[120px] sm:inline-block" />;

  const max = Math.max(...conocidas);
  const min = Math.min(...conocidas);
  const rango = Math.max(1, max - min);

  const x = (i: number) =>
    posiciones.length === 1
      ? ANCHO / 2
      : (i / (posiciones.length - 1)) * (ANCHO - 4) + 2;
  const y = (p: number) => 3 + ((p - min) / rango) * (ALTO - 6);

  // Un tramo por cada racha de puestos conocidos.
  const tramos: string[] = [];
  let actual: string[] = [];
  posiciones.forEach((p, i) => {
    if (p === null) {
      if (actual.length > 1) tramos.push(actual.join(" "));
      actual = [];
      return;
    }
    actual.push(`${x(i)},${y(p)}`);
  });
  if (actual.length > 1) tramos.push(actual.join(" "));

  const ultima = posiciones[posiciones.length - 1];

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      // Se esconde en el movil: entre el puesto, la miniatura, los 120 px de
      // la linea y el movimiento quedaban unos sesenta para el nombre, que es
      // el dato que hay que poder leer. El movimiento sigue contando la
      // historia en pequeno.
      className="hidden h-[26px] w-[120px] shrink-0 overflow-visible sm:block"
      aria-hidden
    >
      {tramos.map((t) => (
        <polyline
          key={t}
          points={t}
          className="fill-none stroke-acid/60"
          strokeWidth={1.5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {ultima !== null && (
        <circle
          cx={x(posiciones.length - 1)}
          cy={y(ultima)}
          r={2.5}
          className="fill-acid"
        />
      )}
    </svg>
  );
}

/**
 * Cómo se ha movido el ranking de Spotify entre las tomas guardadas.
 *
 * La captura guarda una copia cada cierto tiempo, así que esto es lo único de
 * la aplicación que ve mover el ranking *de Spotify*: el suyo se recalcula con
 * criterios que no publica, y sin estas copias no habría forma de saber que
 * cambió.
 */
export default function EvolucionRanking({
  evolucion,
  imagenes,
  hrefPor,
}: {
  evolucion: Evolucion;
  imagenes: Record<string, string>;
  /** Ficha de cada nombre, o undefined si no está en tu historial. */
  hrefPor: (nombre: string) => string | undefined;
}) {
  const { tomas, series, salen } = evolucion;

  if (tomas.length < 2) {
    return (
      <p className="font-serif italic text-mute">
        Hace falta más de una toma para ver movimiento. La captura guarda una
        cada pocos días.
      </p>
    );
  }

  const claveDe = (n: string) =>
    n.normalize("NFKD").replace(/[\p{M}\p{Cf}]/gu, "").toLowerCase().trim();

  return (
    <div>
      <p className="dato-mono text-mute mb-5">
        {tomas.length} tomas · de{" "}
        {new Date(tomas[0]).toLocaleDateString("es")} a{" "}
        {new Date(tomas[tomas.length - 1]).toLocaleDateString("es")}
      </p>

      <ol className="space-y-0.5">
        {series.map((s) => {
          const href = hrefPor(s.nombre);
          const cuerpo = (
            <>
              <span className="label-mono num-tabular w-6 shrink-0 text-mute">
                {String(s.actual).padStart(2, "0")}
              </span>
              <Miniatura
                nombre={s.nombre}
                url={imagenes[claveDe(s.nombre)]}
                lado={34}
              />
              <span className="min-w-0 flex-1 truncate transition-colors duration-200 group-hover:text-acid">
                {s.nombre}
              </span>
              <Linea posiciones={s.posiciones} />
              <span className="w-12 shrink-0 text-right">
                <CambioDePuesto delta={s.delta} />
              </span>
            </>
          );

          const clases =
            "group flex items-center gap-3 rounded-xl px-2 py-1.5 " +
            "transition-[transform,background-color] duration-200 ease-out";

          return (
            <li key={s.nombre}>
              {href ? (
                <Link
                  href={href}
                  className={`${clases} hover:translate-x-1 hover:bg-ink-2/50`}
                >
                  {cuerpo}
                </Link>
              ) : (
                <div className={clases}>{cuerpo}</div>
              )}
            </li>
          );
        })}
      </ol>

      {salen.length > 0 && (
        <p className="label-mono text-mute mt-5 leading-relaxed">
          Salieron desde la toma anterior:{" "}
          <span className="text-cream-dim">{salen.join(" · ")}</span>
        </p>
      )}
    </div>
  );
}
