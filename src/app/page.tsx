import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { getMe } from "@/lib/spotify";
import { parseRange } from "@/lib/stats/range";
import { resolveTimeZone, localParts } from "@/lib/stats/local-time";
import { getTotals } from "@/lib/stats/totals";
import { getTopArtists, getTopTracks, getTopAlbums } from "@/lib/stats/tops";
import { getByHour, getByWeekday, getByMonth, getByDate } from "@/lib/stats/time";
import { getStreaks } from "@/lib/stats/streaks";
import { getSkipStats, getMostSkippedArtists } from "@/lib/stats/skips";
import { getGenreBreakdown, PROFUNDIDAD } from "@/lib/stats/genres";
import TopBar from "@/components/TopBar";
import RangePicker from "@/components/stats/RangePicker";
import StatTiles from "@/components/stats/StatTiles";
import TopList from "@/components/stats/TopList";
import TopArtistas from "@/components/stats/TopArtistas";
import { getImagenesDeArtistas } from "@/lib/stats/imagenes";
import HourClock from "@/components/stats/HourClock";
import WeekdayBars from "@/components/stats/WeekdayBars";
import MonthlyChart from "@/components/stats/MonthlyChart";
import CalendarHeatmap from "@/components/stats/CalendarHeatmap";
import SkipPanel from "@/components/stats/SkipPanel";
import ShareCards from "@/components/stats/ShareCards";
import GenrePanel from "@/components/stats/GenrePanel";
import PlaylistFromTops from "@/components/stats/PlaylistFromTops";

export const dynamic = "force-dynamic";

/**
 * `Date.now()` es impuro; `react-hooks/purity` prohíbe llamarlo directamente
 * en el cuerpo de un componente. Se aísla aquí, igual que en
 * `src/components/CaptureHealth.tsx`.
 */
function ahoraMs(): number {
  return Date.now();
}

/** Minutos a "N h M min", o solo minutos si no llega a la hora. */
function duracion(ms: number): string {
  const minutos = Math.round(ms / 60000);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return `${horas.toLocaleString("es")} h ${minutos % 60} min`;
}

export default async function Portada({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; desde?: string; hasta?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/biblioteca");

  const params = await searchParams;
  const timeZone = resolveTimeZone(process.env);
  const ahora = ahoraMs();
  const range = parseRange(params, ahora, timeZone);
  const hoy = localParts(ahora, timeZone).localDate;

  const [
    me,
    totals,
    artistas,
    canciones,
    albumes,
    horas,
    semana,
    meses,
    dias,
    rachas,
    skips,
    masSaltados,
    generos,
  ] = await Promise.all([
    getMe(),
    getTotals(db, range),
    getTopArtists(db, range, "plays", 10),
    getTopTracks(db, range, "plays", 10),
    getTopAlbums(db, range, "plays", 10),
    getByHour(db, range),
    getByWeekday(db, range),
    getByMonth(db, range),
    getByDate(db, range),
    getStreaks(db, hoy),
    getSkipStats(db, range),
    getMostSkippedArtists(db, range),
    getGenreBreakdown(db, range),
  ]);

  // Depende de los tops, asi que va despues del Promise.all y no dentro: solo
  // hacen falta las fotos de los diez que se van a pintar.
  const imagenesArtistas = await getImagenesDeArtistas(
    db,
    artistas.map((a) => a.key),
  );

  const minutos = Math.round(totals.msTotal / 60000);
  const vacio = totals.reproducciones === 0;

  return (
    <main className="min-h-screen flex flex-col">
      <TopBar me={me} active="portada" />

      <section className="px-8 py-5 hairline-b">
        <RangePicker range={range} />
      </section>

      {/* ---------------- Cifra protagonista ---------------- */}
      <section className="px-8 pt-16 pb-12 hairline-b">
        <div className="grid grid-cols-12 gap-6 items-end">
          <div className="col-span-12 lg:col-span-7 rise">
            <p className="label-mono text-acid mb-6">{range.label}</p>
            <p
              className="display num-tabular text-[clamp(4rem,15vw,12rem)] text-acid leading-[0.82]"
              style={{ fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 1' }}
            >
              {minutos.toLocaleString("es")}
            </p>
            <p className="font-serif italic text-xl text-cream-dim mt-6">
              minutos de música
              {totals.diasActivos > 0 && (
                <> repartidos en {totals.diasActivos.toLocaleString("es")} días</>
              )}
            </p>
          </div>

          <div
            className="col-span-12 lg:col-span-5 flex justify-center lg:justify-end rise"
            style={{ animationDelay: "120ms" }}
          >
            <HourClock buckets={horas} />
          </div>
        </div>
      </section>

      {/* ---------------- Cifras secundarias ---------------- */}
      <section className="hairline-b">
        <StatTiles
          tiles={[
            {
              label: "Reproducciones",
              valor: totals.reproducciones.toLocaleString("es"),
            },
            {
              label: "Artistas",
              valor: totals.artistas.toLocaleString("es"),
              nota: `${totals.canciones.toLocaleString("es")} canciones`,
            },
            {
              label: "Racha actual",
              valor: `${rachas.actual}`,
              nota: `máxima ${rachas.maxima} días`,
              acento: rachas.actual > 0,
            },
            {
              label: "Tiempo total",
              valor: duracion(totals.msTotal),
              nota:
                totals.msTotal > 86_400_000
                  ? `${(totals.msTotal / 86_400_000).toFixed(1)} días seguidos`
                  : undefined,
            },
          ]}
        />
      </section>

      {vacio ? (
        <section className="px-8 py-24">
          <p className="font-serif italic text-2xl text-cream-dim max-w-xl leading-relaxed">
            Todavía no hay escuchas en este rango. La captura guarda lo que
            suene a partir de ahora; cuando importes tu histórico de Spotify
            aparecerá aquí todo lo anterior.
          </p>
        </section>
      ) : (
        <>
          {/* ---------------- Evolución ---------------- */}
          <section className="px-8 py-12 hairline-b rise">
            <MonthlyChart buckets={meses} />
          </section>

          {/* ---------------- Rankings ---------------- */}
          <section className="px-8 pt-12 pb-4 flex justify-end">
            <Link
              href="/escucha/contraste"
              className="label-mono text-mute hover:text-acid transition-colors"
            >
              ¿Y qué cree Spotify? →
            </Link>
          </section>
          {/* Artistas manda: columna mas ancha y con fotos. Tres columnas del
              mismo peso hacian que la seccion se leyera como una tabla en vez
              de como un top, y el ojo no sabia por donde entrar. */}
          <section className="px-8 pb-12 hairline-b grid grid-cols-1 gap-10 lg:grid-cols-[1.5fr_1fr_1fr]">
            <TopArtistas
              entradas={artistas}
              imagenes={imagenesArtistas}
              vacio="Nada en este rango."
            />
            <TopList
              titulo="Canciones"
              entradas={canciones}
              vacio="Nada en este rango."
              hrefBase="/escucha/cancion"
            />
            <TopList
              titulo="Álbumes"
              entradas={albumes}
              vacio="Nada en este rango."
              hrefBase="/escucha/album"
            />
          </section>

          {/* ---------------- Calendario ---------------- */}
          <section className="px-8 py-12 hairline-b rise">
            <CalendarHeatmap buckets={dias} />
          </section>

          {/* ---------------- Semana ---------------- */}
          <section className="px-8 py-12 hairline-b">
            <div className="max-w-2xl">
              <WeekdayBars buckets={semana} />
            </div>
          </section>

          {/* ---------------- Géneros ---------------- */}
          <section className="px-8 py-12 hairline-b rise">
            <GenrePanel
              generos={generos.generos}
              conGeneros={generos.conGeneros}
              sinGeneros={generos.sinGeneros}
              profundidad={PROFUNDIDAD}
              rangeParams={params}
            />
          </section>

          {/* ---------------- Compartir y exportar ---------------- */}
          <section className="px-8 py-12 hairline-b rise flex flex-col gap-12">
            <ShareCards range={range} />
            <PlaylistFromTops rangeParams={params} etiqueta={range.label} />
          </section>

          {/* ---------------- Abandono ---------------- */}
          {skips.conDatos > 0 && (
            <section className="px-8 py-12 hairline-b rise">
              <SkipPanel stats={skips} artistas={masSaltados} />
            </section>
          )}
        </>
      )}

      <footer className="hairline-b mt-auto" />
      <div className="px-8 py-5 flex items-center justify-between label-mono text-mute">
        <span>PORTADA</span>
        <span>{totals.reproducciones.toLocaleString("es")} REPRODUCCIONES</span>
      </div>
    </main>
  );
}
