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
import { getGenreBreakdown } from "@/lib/stats/genres";
import TopBar from "@/components/TopBar";
import RangePicker from "@/components/stats/RangePicker";
import StatTiles from "@/components/stats/StatTiles";
import TopList from "@/components/stats/TopList";
import TopArtistas from "@/components/stats/TopArtistas";
import { getImagenesDeArtistas, getCaratulas } from "@/lib/stats/imagenes";
import Miniatura from "@/components/stats/Miniatura";
import HourClock from "@/components/stats/HourClock";
import WeekdayBars from "@/components/stats/WeekdayBars";
import EvolucionChart from "@/components/stats/EvolucionChart";
import { construirSerie } from "@/lib/stats/serie";
import CalendarioEscuchas from "@/components/stats/Calendario";
import MejoresDias from "@/components/stats/MejoresDias";
import { construirCalendario } from "@/lib/stats/calendario";
import { getDestacadoPorDia } from "@/lib/stats/dia-destacado";
import SkipPanel from "@/components/stats/SkipPanel";
import ShareCards from "@/components/stats/ShareCards";
import GenrePanel from "@/components/stats/GenrePanel";
import PlaylistFromTops from "@/components/stats/PlaylistFromTops";
import AvisoCaptura from "@/components/AvisoCaptura";
import { getCaptureState } from "@/lib/capture/run-capture";
import { saludCaptura } from "@/lib/salud-captura";

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
    estadoCaptura,
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
    getCaptureState(),
  ]);

  // Depende de los tops, asi que va despues del Promise.all y no dentro: solo
  // hacen falta las fotos de los diez que se van a pintar.
  const [imagenesArtistas, caratulasCanciones, caratulasAlbumes] =
    await Promise.all([
      // Se piden juntas las de los dos rankings de artista de la pagina: los
      // mas escuchados y los mas saltados, que rara vez coinciden.
      getImagenesDeArtistas(db, [
        ...new Set([
          ...artistas.map((a) => a.key),
          ...masSaltados.map((a) => a.key),
          // Los que salen al desplegar un genero. Van en la misma consulta:
          // pedirlos aparte serian dos viajes para pintar la misma pantalla.
          ...generos.generos.flatMap((g) => g.top.map((a) => a.key)),
        ]),
      ]),
      getCaratulas(db, "cancion", canciones.map((c) => c.key)),
      getCaratulas(db, "album", albumes.map((a) => a.key)),
    ]);

  // La granularidad la decide la serie: con cuatro semanas hay dos meses, y
  // dos puntos unidos son un segmento recto que no dice nada.
  const serie = construirSerie(dias, meses, range.fromDate, range.toDate);

  // «Historico» no tiene fecha de inicio —fromDate vale 1970-01-01— y dibujarlo
  // literalmente serian cincuenta y seis tiras vacias antes de la primera
  // escucha. Con null, el calendario empieza en el primer dia con datos.
  const calendario = construirCalendario(
    dias,
    range.preset === "all" ? null : range.fromDate,
    range.toDate,
  );

  // La cancion del dia solo se pide cuando la casilla es lo bastante grande
  // como para enseñarla: en el historico serian casi tres mil filas para
  // pintar cuadrados donde no cabe ni el numero del dia.
  const destacados =
    calendario?.forma === "meses" && calendario.densidad === "rica"
      ? await getDestacadoPorDia(db, range)
      : [];

  const destacadosPorFecha = Object.fromEntries(
    destacados.map((d) => [d.date, d]),
  );
  const caratulasDeDias = destacados.length
    ? await getCaratulas(db, "cancion", destacados.map((d) => d.trackKey))
    : {};

  const anioActual = Number(hoy.slice(0, 4));

  const minutos = Math.round(totals.msTotal / 60000);
  const vacio = totals.reproducciones === 0;

  return (
    <main className="min-h-screen flex flex-col">
      <TopBar me={me} active="portada" />

      {/* Solo ocupa sitio cuando la captura no esta recogiendo escuchas. */}
      <AvisoCaptura salud={saludCaptura(estadoCaptura, ahora)} />

      <section className="px-8 py-5 hairline-b">
        <RangePicker range={range} />
      </section>

      {/* ---------------- Cifra protagonista ---------------- */}
      <section className="px-8 pt-16 pb-12 hairline-b">
        <div className="grid grid-cols-12 gap-8 items-end">
          <div className="col-span-12 lg:col-span-5 rise">
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

          {/* El hueco entre la cifra y el reloj eran novecientos pixeles de
              nada en un monitor ancho. Aqui van los dos titulares que hacen que
              el numero signifique algo: quien mandó y cuanto llevas seguido. */}
          <div
            className="col-span-12 lg:col-span-4 flex flex-col gap-3 rise"
            style={{ animationDelay: "90ms" }}
          >
            {artistas[0] && (
              <Link
                href={`/escucha/artista/${encodeURIComponent(artistas[0].key)}`}
                className="group flex items-center gap-4 rounded-2xl bg-ink-2/40 p-4
                           ring-1 ring-rule transition-[background-color,box-shadow]
                           duration-300 hover:bg-ink-2 hover:ring-acid/40"
              >
                <Miniatura
                  nombre={artistas[0].name}
                  url={imagenesArtistas[artistas[0].key]}
                  lado={64}
                  redondeo="rounded-xl"
                />
                <span className="min-w-0">
                  <span className="label-mono text-mute">Quien mandó</span>
                  <span className="mt-1 block truncate font-serif text-xl transition-colors duration-200 group-hover:text-acid">
                    {artistas[0].name}
                  </span>
                  <span className="dato-mono text-mute num-tabular">
                    {artistas[0].plays.toLocaleString("es")} veces ·{" "}
                    {duracion(artistas[0].ms)}
                  </span>
                </span>
              </Link>
            )}

            {rachas.actual > 0 && (
              <div className="rounded-2xl bg-ink-2/40 p-4 ring-1 ring-rule">
                <span className="label-mono text-mute">Sin fallar un día</span>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="display num-tabular text-4xl text-acid">
                    {rachas.actual.toLocaleString("es")}
                  </span>
                  <span className="font-serif italic text-cream-dim">
                    días seguidos
                  </span>
                </p>
                <span className="dato-mono text-mute num-tabular">
                  tu récord son {rachas.maxima.toLocaleString("es")}
                </span>
              </div>
            )}
          </div>

          <div
            className="col-span-12 lg:col-span-3 flex justify-center lg:justify-end rise"
            style={{ animationDelay: "180ms" }}
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
            <EvolucionChart serie={serie} />
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
              imagenes={caratulasCanciones}
            />
            <TopList
              titulo="Álbumes"
              entradas={albumes}
              vacio="Nada en este rango."
              hrefBase="/escucha/album"
              imagenes={caratulasAlbumes}
            />
          </section>

          {/* ---------------- Calendario ---------------- */}
          {calendario && (
            <section className="px-8 py-12 hairline-b rise">
              <div className="mb-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <h2 className="display-italic text-[clamp(1.8rem,4vw,3rem)]">
                  Día a día.
                </h2>
                <p className="dato-mono text-mute">
                  {dias.length.toLocaleString("es")} días con música ·{" "}
                  {totals.reproducciones.toLocaleString("es")} escuchas
                </p>
              </div>

              {/* El calendario y el reparto semanal cuentan lo mismo a dos
                  escalas, y estaban en secciones distintas ocupando cada una
                  media pagina. Juntos llenan el ancho y se leen a la vez. */}
              <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
                <CalendarioEscuchas
                  calendario={calendario}
                  destacados={destacadosPorFecha}
                  caratulas={caratulasDeDias}
                />

                <aside className="flex flex-col gap-10">
                  <WeekdayBars buckets={semana} />
                  <MejoresDias buckets={dias} anioActual={anioActual} />
                </aside>
              </div>
            </section>
          )}

          {/* ---------------- Géneros ---------------- */}
          <section className="px-8 py-12 hairline-b rise">
            <GenrePanel
              generos={generos.generos}
              epocas={generos.epocas}
              procedencias={generos.procedencias}
              voces={generos.voces}
              analizados={generos.analizados}
              conEtiquetas={generos.conEtiquetas}
              sinEtiquetas={generos.sinEtiquetas}
              pendientes={generos.pendientes}
              imagenes={imagenesArtistas}
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
              <SkipPanel
          stats={skips}
          artistas={masSaltados}
          imagenes={imagenesArtistas}
        />
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
