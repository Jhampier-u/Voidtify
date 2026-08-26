import Link from "next/link";

type Bucket = { date: string; plays: number; ms: number };

const CELDA = 13;
const HUECO = 3;
const PASO = CELDA + HUECO;
const CARRIL = 26; // ancho de la columna de etiquetas de día
const CABECERA = 18; // alto de la fila de meses

const DIAS = ["L", "", "M", "", "V", "", "D"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const DIA_MS = 86_400_000;

function aUTC(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function aTexto(ms: number): string {
  const v = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
}

/** Lunes = 0. */
function diaSemana(ms: number): number {
  return (new Date(ms).getUTCDay() + 6) % 7;
}

/** El lunes de la semana a la que pertenece una fecha. */
function lunesDe(ms: number): number {
  return ms - diaSemana(ms) * DIA_MS;
}

/**
 * Mapa de calor recortado a las semanas que existen, no al año entero.
 *
 * Dibujar siempre doce meses hacía que un rango de cuatro semanas apareciera
 * como un grupito perdido en medio de una rejilla vacía. Ahora la rejilla va
 * del primer día al último del rango, y se parte por años solo cuando el rango
 * abarca más de uno.
 *
 * Cada celda enlaza al historial de ese día: el calendario deja de ser una
 * ilustración y pasa a ser una forma de navegar.
 */
export default function CalendarHeatmap({ buckets }: { buckets: Bucket[] }) {
  if (buckets.length === 0) return null;

  const porFecha = new Map(buckets.map((b) => [b.date, b]));
  const max = Math.max(...buckets.map((b) => b.plays));

  const primero = aUTC(buckets[0].date);
  const ultimo = aUTC(buckets[buckets.length - 1].date);

  const anioIni = new Date(primero).getUTCFullYear();
  const anioFin = new Date(ultimo).getUTCFullYear();
  const variosAnios = anioFin > anioIni;

  // Un tramo por año cuando el rango abarca varios; si no, uno solo.
  const tramos: { titulo: string; desde: number; hasta: number }[] = [];
  if (variosAnios) {
    for (let a = anioFin; a >= anioIni; a--) {
      tramos.push({
        titulo: String(a),
        desde: Math.max(primero, Date.UTC(a, 0, 1)),
        hasta: Math.min(ultimo, Date.UTC(a, 11, 31)),
      });
    }
  } else {
    tramos.push({ titulo: String(anioIni), desde: primero, hasta: ultimo });
  }

  const total = buckets.reduce((n, b) => n + b.plays, 0);
  const mejor = buckets.reduce((a, b) => (b.plays > a.plays ? b : a), buckets[0]);

  return (
    <section>
      <div className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
        <p className="label-mono text-mute">
          {buckets.length.toLocaleString("es")} días con música ·{" "}
          {total.toLocaleString("es")} escuchas
        </p>
        <p className="label-mono text-mute">
          tu mejor día ·{" "}
          <Link
            href={`/historial?desde=${mejor.date}&hasta=${mejor.date}`}
            className="text-acid hover:underline"
          >
            {mejor.date}
          </Link>{" "}
          · {mejor.plays.toLocaleString("es")}
        </p>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex flex-col gap-5">
          {tramos.map((tramo) => {
            const inicio = lunesDe(tramo.desde);
            const semanas =
              Math.floor((lunesDe(tramo.hasta) - inicio) / (7 * DIA_MS)) + 1;
            const ancho = CARRIL + semanas * PASO;
            const alto = CABECERA + 7 * PASO;

            // Primera semana de cada mes, para colocar su etiqueta.
            const etiquetas: { x: number; texto: string }[] = [];
            let mesPrevio = -1;
            for (let s = 0; s < semanas; s++) {
              const lunes = inicio + s * 7 * DIA_MS;
              const mes = new Date(lunes).getUTCMonth();
              if (mes !== mesPrevio) {
                etiquetas.push({ x: CARRIL + s * PASO, texto: MESES[mes] });
                mesPrevio = mes;
              }
            }

            return (
              <div key={tramo.titulo} className="flex items-start gap-4">
                {variosAnios && (
                  <span className="label-mono text-mute num-tabular w-10 shrink-0 pt-5">
                    {tramo.titulo}
                  </span>
                )}

                <svg
                  width={ancho}
                  height={alto}
                  viewBox={`0 0 ${ancho} ${alto}`}
                  className="shrink-0"
                  role="img"
                  aria-label={`Actividad diaria de ${tramo.titulo}`}
                >
                  {etiquetas.map((e) => (
                    <text
                      key={`${tramo.titulo}-${e.x}`}
                      x={e.x}
                      y={11}
                      className="fill-mute font-mono"
                      style={{ fontSize: 9 }}
                    >
                      {e.texto}
                    </text>
                  ))}

                  {DIAS.map((d, i) =>
                    d ? (
                      <text
                        key={i}
                        x={0}
                        y={CABECERA + i * PASO + CELDA - 2}
                        className="fill-mute font-mono"
                        style={{ fontSize: 9 }}
                      >
                        {d}
                      </text>
                    ) : null,
                  )}

                  {Array.from({ length: semanas * 7 }, (_, i) => {
                    const s = Math.floor(i / 7);
                    const dow = i % 7;
                    const ms = inicio + (s * 7 + dow) * DIA_MS;
                    if (ms < tramo.desde || ms > tramo.hasta) return null;

                    const fecha = aTexto(ms);
                    const b = porFecha.get(fecha);
                    const x = CARRIL + s * PASO;
                    const y = CABECERA + dow * PASO;

                    if (!b) {
                      return (
                        <rect
                          key={fecha}
                          x={x}
                          y={y}
                          width={CELDA}
                          height={CELDA}
                          rx={2}
                          className="fill-ink-2"
                        >
                          <title>{`${fecha} · sin música`}</title>
                        </rect>
                      );
                    }

                    // Cinco escalones: un degradado continuo sobre celdas de
                    // trece píxeles no se distingue y ensucia la lectura.
                    const nivel = Math.ceil(Math.min(1, b.plays / max) * 4) || 1;

                    return (
                      <Link
                        key={fecha}
                        href={`/historial?desde=${fecha}&hasta=${fecha}`}
                      >
                        <rect
                          x={x}
                          y={y}
                          width={CELDA}
                          height={CELDA}
                          rx={2}
                          className="fill-acid hover:stroke-cream cursor-pointer"
                          strokeWidth={1.5}
                          opacity={0.2 + nivel * 0.2}
                        >
                          <title>
                            {`${fecha} · ${b.plays} escuchas · ${Math.round(
                              b.ms / 60000,
                            )} min`}
                          </title>
                        </rect>
                      </Link>
                    );
                  })}
                </svg>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-5 flex-wrap">
        <span className="label-mono text-mute">menos</span>
        <svg width={5 * PASO} height={CELDA} className="shrink-0">
          <rect width={CELDA} height={CELDA} rx={2} className="fill-ink-2" />
          {[1, 2, 3, 4].map((n) => (
            <rect
              key={n}
              x={n * PASO}
              width={CELDA}
              height={CELDA}
              rx={2}
              className="fill-acid"
              opacity={0.2 + n * 0.2}
            />
          ))}
        </svg>
        <span className="label-mono text-mute">más</span>
        <span className="label-mono text-mute ml-2">
          pincha un día para ver qué sonó
        </span>
      </div>
    </section>
  );
}
