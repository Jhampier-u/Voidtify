import type { Variacion } from "@/lib/stats/variacion";

type Tile = {
  label: string;
  valor: string;
  nota?: string;
  acento?: boolean;
  /** Cambio frente al mismo periodo anterior. Se omite si no aplica. */
  variacion?: Variacion;
};

/**
 * Cifras secundarias como retícula, no como párrafo.
 *
 * Un renglón de texto con cuatro números seguidos obliga a leerlo entero para
 * encontrar uno. En cuadrícula, cada cifra tiene sitio propio y se localiza de
 * un vistazo — que es lo único que se le pide a un dato secundario.
 *
 * Cada una lleva además cuánto ha cambiado respecto al periodo anterior de
 * igual duración. Sola, «1.359 reproducciones» no responde a la única pregunta
 * que se hace al mirarla, que es si eso es mucho o poco para ti.
 */
export default function StatTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <dl className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-rule">
      {tiles.map((t, i) => (
        <div
          key={t.label}
          className="group bg-ink px-5 py-6 rise
                     transition-colors duration-200 hover:bg-ink-2"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <dt className="label-mono text-mute mb-3 transition-colors duration-200 group-hover:text-cream-dim">
            {t.label}
          </dt>

          <dd className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className={`num-tabular text-[clamp(1.6rem,3.4vw,2.6rem)] leading-none ${
                t.acento ? "text-acid" : "text-cream"
              }`}
            >
              {t.valor}
            </span>
            {t.variacion && <Cambio v={t.variacion} />}
          </dd>

          {t.nota && <dd className="label-mono text-mute mt-2">{t.nota}</dd>}
        </div>
      ))}
    </dl>
  );
}

/**
 * El cambio, en pequeño y al lado de la cifra.
 *
 * `igual` y `desconocido` no pintan nada. Un «0 %» o un «—» ocupan sitio para
 * decir que no hay noticia, y cuatro casillas con guiones se leen como que algo
 * ha fallado.
 */
function Cambio({ v }: { v: Variacion }) {
  if (v.sentido === "igual" || v.sentido === "desconocido") return null;

  if (v.sentido === "estreno") {
    return (
      <span
        className="label-mono text-acid"
        title="no hubo nada en el mismo periodo anterior"
      >
        estreno
      </span>
    );
  }

  const sube = v.sentido === "sube";
  return (
    <span
      className={`label-mono num-tabular ${sube ? "text-acid" : "text-blood"}`}
      title="frente al mismo periodo anterior, de igual duración"
    >
      {sube ? "↑" : "↓"} {Math.abs(v.pct ?? 0)} %
    </span>
  );
}
