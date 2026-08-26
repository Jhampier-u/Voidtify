import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { getMe } from "@/lib/spotify";
import { parseRange } from "@/lib/stats/range";
import { resolveTimeZone } from "@/lib/stats/local-time";
import { getArtistDetail } from "@/lib/stats/detail";
import TopBar from "@/components/TopBar";
import Miniatura from "@/components/stats/Miniatura";
import { getImagenesDeArtistas, getCaratulas } from "@/lib/stats/imagenes";
import { duracion } from "@/lib/formato";
import RangePicker from "@/components/stats/RangePicker";

export const dynamic = "force-dynamic";

function ahoraMs(): number {
  return Date.now();
}

function fecha(ms: number): string {
  return new Date(ms).toLocaleDateString("es", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: process.env.STATS_TZ,
  });
}

export default async function FichaArtista({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ preset?: string; desde?: string; hasta?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/biblioteca");

  const { key } = await params;
  const sp = await searchParams;
  const timeZone = resolveTimeZone(process.env);
  const range = parseRange(sp, ahoraMs(), timeZone);

  const clave = decodeURIComponent(key);
  const [me, ficha] = await Promise.all([
    getMe(),
    getArtistDetail(db, range, clave),
  ]);

  if (!ficha) notFound();

  // Depende de la ficha, asi que va despues: solo hacen falta la foto de este
  // artista y las caratulas de las canciones que se van a pintar.
  const [imagenes, caratulas] = await Promise.all([
    getImagenesDeArtistas(db, [clave]),
    getCaratulas(db, "cancion", ficha.topTracks.map((t) => t.key)),
  ]);

  const minutos = Math.round(ficha.ms / 60000);
  const horas = ficha.ms / 3_600_000;
  const maxTrack = Math.max(1, ...ficha.topTracks.map((t) => t.plays));

  // La consulta mira los 1000 primeros: más allá, la posición no se conoce.
  const posicion =
    ficha.posicion === null ? "fuera del top 1000" : `#${ficha.posicion}`;

  return (
    <main className="min-h-screen flex flex-col">
      <TopBar me={me} active="portada" />

      <section className="px-8 py-5 hairline-b flex items-center justify-between gap-4 flex-wrap">
        <RangePicker range={range} base={`/escucha/artista/${key}`} />
        <Link href="/" className="label-mono text-mute hover:text-acid transition-colors">
          ← Portada
        </Link>
      </section>

      <section className="relative overflow-hidden px-8 pt-16 pb-12 hairline-b">
        {/* Halo del color de la marca detras de la foto: da profundidad sin
            recurrir a una sombra, que sobre un fondo casi negro no se ve. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 h-96 w-96
                     rounded-full bg-acid/[0.05] blur-3xl"
        />

        <div className="relative flex items-end gap-8 flex-wrap">
          <div className="rise">
            <Miniatura
              nombre={ficha.name}
              url={imagenes[clave]}
              lado={168}
              redondeo="rounded-3xl"
            />
          </div>

          <div className="min-w-0 flex-1 rise" style={{ animationDelay: "80ms" }}>
            <p className="label-mono text-acid mb-5">
              {posicion} en tu ranking · {range.label}
            </p>
            <h1
              className="display-italic text-[clamp(2.4rem,7vw,5.5rem)] leading-[0.9] break-words"
              style={{ fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 1' }}
            >
              {ficha.name}
            </h1>
          </div>
        </div>
      </section>

      <section className="hairline-b">
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-rule">
          {[
            { label: "Reproducciones", valor: ficha.plays.toLocaleString("es") },
            {
              label: "Tiempo",
              valor:
                horas >= 1
                  ? `${horas.toFixed(1)} h`
                  : `${minutos.toLocaleString("es")} min`,
            },
            { label: "Primera vez", valor: fecha(ficha.primeraVez) },
            { label: "Última vez", valor: fecha(ficha.ultimaVez) },
          ].map((t, i) => (
            <div
              key={t.label}
              className="bg-ink px-5 py-6 rise"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <dt className="label-mono text-mute mb-3">{t.label}</dt>
              <dd className="num-tabular text-[clamp(1.2rem,2.4vw,1.7rem)] leading-tight">
                {t.valor}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="px-8 py-12">
        <p className="label-mono text-mute mb-4">Lo que más le escuchas</p>
        <ol className="max-w-2xl">
          {ficha.topTracks.map((t, i) => (
            <li
              key={t.key}
              className="group relative flex items-center justify-between gap-3 overflow-hidden rounded-xl px-2 py-1.5 rise transition-[transform,background-color] duration-200 ease-out hover:translate-x-1 hover:bg-ink-2/50"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span
                aria-hidden
                className="absolute inset-y-1 left-0 rounded-r-full opacity-70
                           bg-gradient-to-r from-acid/25 via-acid/12 to-acid/[0.03]
                           transition-opacity duration-200 group-hover:opacity-100"
                style={{ width: `${(t.plays / maxTrack) * 100}%` }}
              />

              <span className="relative flex items-center gap-3 min-w-0">
                <span
                  className={`label-mono num-tabular w-6 shrink-0 ${
                    i === 0 ? "text-acid" : "text-mute"
                  }`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Miniatura nombre={t.name} url={caratulas[t.key]} lado={38} />
                <Link
                  href={`/escucha/cancion/${encodeURIComponent(t.key)}`}
                  className="truncate transition-colors duration-200 hover:text-acid"
                >
                  {t.name}
                </Link>
              </span>

              <span className="relative shrink-0 text-right">
                <span className="block num-tabular font-mono text-sm text-cream-dim">
                  {t.plays.toLocaleString("es")}
                </span>
                <span className="block num-tabular font-mono text-[11px] text-mute">
                  {duracion(t.ms)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="hairline-b mt-auto" />
      <div className="px-8 py-5 flex items-center justify-between label-mono text-mute">
        <span>FICHA</span>
        <span>{ficha.plays.toLocaleString("es")} REPRODUCCIONES</span>
      </div>
    </main>
  );
}
