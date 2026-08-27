import { etiquetaPeriodo, type Mezcla } from "@/lib/stats/genero-tiempo";

/**
 * Ocho bandas distinguibles sobre fondo casi negro.
 *
 * Salen del sistema de etiquetas que ya existe. Un degradado de verdes habría
 * sido más elegante y completamente inútil: con ocho bandas apiladas hay que
 * poder decir cuál es cuál de un vistazo, y para eso hace falta tono, no
 * luminosidad.
 */
const COLORES = [
  "var(--color-acid)",
  "var(--color-tag-sky)",
  "var(--color-tag-coral)",
  "var(--color-tag-violet)",
  "var(--color-tag-mint)",
  "var(--color-tag-amber)",
  "var(--color-tag-rose)",
  "var(--color-cream-dim)",
];

const OTROS = "var(--color-rule)";

const ALTO = 100;

/**
 * De qué estaba hecho lo que escuchabas, mes a mes.
 *
 * Va normalizado: cada mes suma cien. La pregunta que responde es la mezcla, no
 * el volumen — eso ya lo cuenta el gráfico de evolución de más arriba, y
 * repetirlo aquí en forma de área apilada sería el mismo dato dos veces.
 *
 * Los meses sin escuchas aparecen como un corte hasta la línea de base. Es
 * deliberado: saltárselos uniría marzo con junio y enseñaría una transición
 * suave donde hubo tres meses de silencio.
 */
export default function MezclaEnElTiempo({ mezcla }: { mezcla: Mezcla }) {
  const { generos, granularidad, puntos } = mezcla;
  if (puntos.length < 2) return null;

  const ancho = puntos.length - 1;
  const x = (i: number) => i;
  const y = (v: number) => (1 - v) * ALTO;

  // Límite superior acumulado de cada banda, banda a banda. El de la última es
  // la línea de arriba del todo, que con «otros» siempre llega a uno.
  const acumulados: number[][] = [];
  let previo = puntos.map(() => 0);
  for (let k = 0; k < generos.length; k++) {
    const actual = puntos.map((p, i) => previo[i] + p.partes[k]);
    acumulados.push(actual);
    previo = actual;
  }
  const conOtros = puntos.map((p, i) => previo[i] + p.otros);

  const area = (arriba: number[], abajo: number[]) => {
    const ida = arriba.map((v, i) => `${x(i)},${y(v)}`).join(" L");
    const vuelta = abajo
      .map((v, i) => `${x(abajo.length - 1 - i)},${y(abajo[abajo.length - 1 - i])}`)
      .join(" L");
    return `M${ida} L${vuelta} Z`;
  };

  // Cuántas etiquetas caben sin pisarse. Con noventa y seis meses no caben
  // todas ni escribiéndolas de canto.
  const paso = Math.max(1, Math.ceil(puntos.length / 12));
  const marcas = puntos
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i % paso === 0 || i === puntos.length - 1);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {generos.map((g, k) => (
          <span key={g} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
              style={{ background: COLORES[k % COLORES.length] }}
            />
            <span className="dato-mono text-cream-dim">{g}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
            style={{ background: OTROS }}
          />
          <span className="dato-mono text-mute">todo lo demás</span>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${ancho} ${ALTO}`}
        preserveAspectRatio="none"
        className="h-[220px] w-full"
        role="img"
        aria-label="Reparto de géneros mes a mes"
      >
        {/* «Otros» va arriba del todo para que las bandas de género se apoyen
            en la línea de base, que es donde se comparan sin esfuerzo. */}
        <path d={area(conOtros, acumulados[acumulados.length - 1])} fill={OTROS} />

        {acumulados.map((arriba, k) => (
          <path
            key={generos[k]}
            d={area(arriba, k === 0 ? puntos.map(() => 0) : acumulados[k - 1])}
            fill={COLORES[k % COLORES.length]}
            opacity={0.85}
          >
            <title>{generos[k]}</title>
          </path>
        ))}
      </svg>

      <div className="relative mt-2 h-4">
        {marcas.map(({ p, i }) => (
          <span
            key={p.periodo}
            className="dato-mono absolute -translate-x-1/2 whitespace-nowrap text-mute"
            style={{ left: `${(i / ancho) * 100}%` }}
          >
            {etiquetaPeriodo(p.periodo, granularidad)}
          </span>
        ))}
      </div>
    </div>
  );
}
