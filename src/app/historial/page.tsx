import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { getMe } from "@/lib/spotify";
import { parseRange } from "@/lib/stats/range";
import { resolveTimeZone } from "@/lib/stats/local-time";
import { getHistory } from "@/lib/stats/history";
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

  const pagina = Math.max(1, Number(sp.p) || 1);
  const busqueda = sp.q?.trim() || undefined;

  const [me, { rows, total }] = await Promise.all([
    getMe(),
    getHistory(db, range, {
      limite: POR_PAGINA,
      desplazamiento: (pagina - 1) * POR_PAGINA,
      busqueda,
    }),
  ]);

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const base = { ...sp, p: undefined };

  // Se marca aquí qué filas abren un día nuevo, en vez de arrastrar una
  // variable mutable dentro del `map`: mutar durante el render puede dar
  // resultados distintos entre pasadas, y `react-hooks/immutability` lo veta.
  const conDia = rows.map((r, i) => ({
    fila: r,
    nuevoDia: i === 0 || r.localDate !== rows[i - 1].localDate,
  }));

  return (
    <main className="min-h-screen flex flex-col">
      <TopBar me={me} active="historial" />

      <section className="px-8 py-5 hairline-b">
        <RangePicker range={range} base="/historial" />
      </section>

      <section className="px-8 py-8 hairline-b flex items-end justify-between gap-6 flex-wrap">
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
              placeholder="artista o canción"
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
        <section className="px-8 py-24">
          <p className="font-serif italic text-xl text-cream-dim max-w-lg">
            Nada que mostrar con este filtro.
          </p>
        </section>
      ) : (
        <section className="px-8 py-8">
          <ol>
            {conDia.map(({ fila: r, nuevoDia }) => {
              return (
                <li key={r.id}>
                  {nuevoDia && (
                    <p className="label-mono text-acid pt-6 pb-2">
                      {r.localDate}
                    </p>
                  )}
                  <div className="flex items-baseline gap-4 py-1.5 hairline-b">
                    <span className="label-mono text-mute num-tabular w-12 shrink-0">
                      {hora(r.ts)}
                    </span>
                    <span className="flex-1 min-w-0 truncate">
                      {r.trackName}
                      <span className="text-mute"> · {r.artistName}</span>
                    </span>
                    <span className="dato-mono text-mute num-tabular shrink-0">
                      {Math.round(r.msPlayed / 1000)}s
                    </span>
                    {r.source === "live" && (
                      <span className="label-mono text-mute shrink-0">live</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {paginas > 1 && (
            <nav className="flex items-center justify-between mt-10">
              {pagina > 1 ? (
                <Link
                  href={enlace(base, { p: String(pagina - 1) })}
                  className="label-mono hover:text-acid transition-colors"
                >
                  ← Anterior
                </Link>
              ) : (
                <span />
              )}

              <span className="label-mono text-mute num-tabular">
                {pagina} / {paginas.toLocaleString("es")}
              </span>

              {pagina < paginas ? (
                <Link
                  href={enlace(base, { p: String(pagina + 1) })}
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
      <div className="px-8 py-5 flex items-center justify-between label-mono text-mute">
        <span>HISTORIAL</span>
        <span>{total.toLocaleString("es")} ESCUCHAS</span>
      </div>
    </main>
  );
}
