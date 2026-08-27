import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { getMe } from "@/lib/spotify";
import { parseRange } from "@/lib/stats/range";
import { resolveTimeZone } from "@/lib/stats/local-time";
import { getHistory, getTotalesDeDias } from "@/lib/stats/history";
import { calcularPagina } from "@/lib/paginar";
import { getCaratulas } from "@/lib/stats/imagenes";
import { duracion, duracionCorta, fechaLarga } from "@/lib/formato";
import Miniatura from "@/components/stats/Miniatura";
import TopBar from "@/components/TopBar";
import RangePicker from "@/components/stats/RangePicker";

export const dynamic = "force-dynamic";

const POR_PAGINA = 100;

function ahoraMs(): number {
  return Date.now();
}

function hora(ts: number): string {
  return new Date(ts).toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: process.env.STATS_TZ,
  });
}

/**
 * Conserva los parámetros de rango y búsqueda al cambiar de página.
 *
 * Sin esto, pasar a la página 2 perdería el filtro y el usuario acabaría
 * mirando otra cosa sin darse cuenta.
 */
function enlace(
  base: Record<string, string | undefined>,
  cambios: Record<string, string | undefined>,
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...cambios })) {
    if (v) p.set(k, v);
  }
  const q = p.toString();
  return q ? `/historial?${q}` : "/historial";
}

export default async function Historial({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    desde?: string;
    hasta?: string;
    q?: string;
    p?: string;
  }>;
}) {
  const session = await auth();
  if (!session) redirect("/biblioteca");

  const sp = await searchParams;
  const timeZone = resolveTimeZone(process.env);
  const range = parseRange(sp, ahoraMs(), timeZone);

  const pedida = Number(sp.p) || 1;
  const busqueda = sp.q?.trim() || undefined;

  const [me, primera] = await Promise.all([
    getMe(),
    getHistory(db, range, {
      limite: POR_PAGINA,
      desplazamiento: Math.max(0, (Math.floor(pedida) - 1) * POR_PAGINA),
      busqueda,
    }),
  ]);

  // El total solo se conoce despues de consultar, asi que la pagina se acota
  // aqui. Solo se vuelve a consultar si la pedida no existia --«?p=999»--, que
  // antes devolvia una lista vacia con el paginador diciendo «999 / 27».
  const { actual, paginas } = calcularPagina(primera.total, pedida, POR_PAGINA);
  const { rows, total } =
    actual === Math.max(1, Math.floor(pedida) || 1)
      ? primera
      : await getHistory(db, range, {
          limite: POR_PAGINA,
          desplazamiento: (actual - 1) * POR_PAGINA,
          busqueda,
        });

  const base = { ...sp, p: undefined };

  // Se marca aquí qué filas abren un día nuevo, en vez de arrastrar una
  // variable mutable dentro del `map`: mutar durante el render puede dar
  // resultados distintos entre pasadas, y `react-hooks/immutability` lo veta.
  const conDia = rows.map((r, i) => ({
    fila: r,
    nuevoDia: i === 0 || r.localDate !== rows[i - 1].localDate,
  }));

  // Solo los días y las carátulas de lo que se pinta en esta página.
  const [caratulas, totalesDia] = await Promise.all([
    getCaratulas(db, "cancion", [...new Set(rows.map((r) => r.trackKey))]),
    getTotalesDeDias(db, [...new Set(rows.map((r) => r.localDate))]),
  ]);
  const anioActual = new Date(ahoraMs()).getFullYear();

  return (
    <main className="min-h-screen flex flex-col">
      <TopBar me={me} active="historial" />

      <section className="px-5 sm:px-8 py-5 hairline-b">
        <RangePicker range={range} base="/historial" />
      </section>

      <section className="px-5 sm:px-8 py-8 hairline-b flex items-end justify-between gap-6 flex-wrap">
        <form method="get" className="flex items-end gap-3">
          {sp.preset && <input type="hidden" name="preset" value={sp.preset} />}
          {sp.desde && <input type="hidden" name="desde" value={sp.desde} />}
          {sp.hasta && <input type="hidden" name="hasta" value={sp.hasta} />}
          <label className="flex flex-col gap-2">
            <span className="label-mono text-mute">Buscar</span>
            <input
              type="search"
              name="q"
              defaultValue={busqueda ?? ""}
              placeholder="artista, canción o álbum"
              className="bg-ink-2 border border-rule px-3 py-2 font-mono text-sm w-64 focus:border-acid outline-none"
            />
          </label>
          <button className="label-mono border border-current px-4 py-2">
            Buscar
          </button>
        </form>

        <p className="label-mono text-mute num-tabular">
          {total.toLocaleString("es")} escuchas
          {busqueda && <> · filtrando por «{busqueda}»</>}
        </p>
      </section>

      {rows.length === 0 ? (
        <section className="px-5 sm:px-8 py-24">
          <p className="font-serif italic text-xl text-cream-dim max-w-lg">
            Nada que mostrar con este filtro.
          </p>
        </section>
      ) : (
        <section className="px-5 sm:px-8 py-8">
          <ol>
            {conDia.map(({ fila: r, nuevoDia }) => {
              const total = totalesDia[r.localDate];
              return (
                <li key={r.id}>
                  {nuevoDia && (
                    <div className="flex items-baseline justify-between gap-4 pt-8 pb-3">
                      <p className="font-serif text-lg text-cream">
                        {fechaLarga(r.localDate, anioActual)}
                      </p>
                      {total && (
                        // Del día entero, no de las filas de esta página: un
                        // día puede quedar partido y la cifra cambiaría al
                        // pasar de página sin cambiar los datos.
                        <p className="dato-mono text-mute shrink-0">
                          {total.plays.toLocaleString("es")} ·{" "}
                          {duracion(total.ms)}
                        </p>
                      )}
                    </div>
                  )}
                  <Link
                    href={`/escucha/cancion/${encodeURIComponent(r.trackKey)}`}
                    className="group flex items-center gap-3 rounded-xl px-2 py-1.5
                               transition-[transform,background-color] duration-200
                               ease-out hover:translate-x-1 hover:bg-ink-2/50"
                  >
                    <span className="dato-mono text-mute w-11 shrink-0">
                      {hora(r.ts)}
                    </span>

                    <Miniatura
                      nombre={r.trackName}
                      url={caratulas[r.trackKey]}
                      lado={34}
                    />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate transition-colors duration-200 group-hover:text-acid">
                        {r.trackName}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-mute">
                        {r.artistName}
                      </span>
                    </span>

                    <span className="dato-mono text-mute shrink-0">
                      {duracionCorta(r.msPlayed)}
                    </span>
                    {r.source === "live" && (
                      <span
                        className="label-mono text-mute shrink-0"
                        title="Capturada en vivo, no importada del volcado"
                      >
                        live
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>

          {paginas > 1 && (
            <nav className="flex items-center justify-between mt-10">
              {actual > 1 ? (
                <Link
                  href={enlace(base, { p: String(actual - 1) })}
                  className="label-mono hover:text-acid transition-colors"
                >
                  ← Anterior
                </Link>
              ) : (
                <span />
              )}

              <span className="dato-mono text-mute">
                {actual} de {paginas.toLocaleString("es")}
              </span>

              {actual < paginas ? (
                <Link
                  href={enlace(base, { p: String(actual + 1) })}
                  className="label-mono hover:text-acid transition-colors"
                >
                  Siguiente →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </section>
      )}

      <footer className="hairline-b mt-auto" />
      <div className="px-5 sm:px-8 py-5 flex items-center justify-between label-mono text-mute">
        <span>HISTORIAL</span>
        <span>{total.toLocaleString("es")} ESCUCHAS</span>
      </div>
    </main>
  );
}
