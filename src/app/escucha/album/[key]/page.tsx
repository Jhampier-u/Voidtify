import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { getMe } from "@/lib/spotify";
import { parseRange } from "@/lib/stats/range";
import { resolveTimeZone } from "@/lib/stats/local-time";
import { getAlbumDetail } from "@/lib/stats/detail";
import TopBar from "@/components/TopBar";
import RangePicker from "@/components/stats/RangePicker";
import EntityHeader from "@/components/stats/EntityHeader";
import { getCaratulas } from "@/lib/stats/imagenes";

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

export default async function FichaAlbum({
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
  const range = parseRange(sp, ahoraMs(), resolveTimeZone(process.env));

  const [me, ficha] = await Promise.all([
    getMe(),
    getAlbumDetail(db, range, decodeURIComponent(key)),
  ]);

  if (!ficha) notFound();

  const caratulas = await getCaratulas(db, "album", [decodeURIComponent(key)]);

  const horas = ficha.ms / 3_600_000;
  const max = Math.max(1, ...ficha.tracks.map((t) => t.plays));

  return (
    <main className="min-h-screen flex flex-col">
      <TopBar me={me} active="portada" />

      <section className="px-5 sm:px-8 py-5 hairline-b flex items-center justify-between gap-4 flex-wrap">
        <RangePicker range={range} base={`/escucha/album/${key}`} />
        <Link href="/" className="label-mono text-mute hover:text-acid transition-colors">
          ← Portada
        </Link>
      </section>

      <EntityHeader
        posicion={ficha.posicion}
        contexto={range.label}
        titulo={ficha.name}
        subtitulo={ficha.artistName}
        subtituloHref={`/escucha/artista/${encodeURIComponent(ficha.artistKey)}`}
        imagen={caratulas[decodeURIComponent(key)]}
        tiles={[
          { label: "Reproducciones", valor: ficha.plays.toLocaleString("es") },
          {
            label: "Tiempo",
            valor:
              horas >= 1
                ? `${horas.toFixed(1)} h`
                : `${Math.round(ficha.ms / 60000).toLocaleString("es")} min`,
          },
          { label: "Primera vez", valor: fecha(ficha.primeraVez) },
          { label: "Última vez", valor: fecha(ficha.ultimaVez) },
        ]}
      />

      <section className="px-5 sm:px-8 py-12">
        <p className="label-mono text-mute mb-4">
          Sus canciones · {ficha.tracks.length}
        </p>
        <ol className="max-w-2xl">
          {ficha.tracks.map((t, i) => (
            <li
              key={t.key}
              className="relative flex items-baseline justify-between gap-4 px-2 py-2.5 hairline-b overflow-hidden rise"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 bg-acid/10"
                style={{ width: `${(t.plays / max) * 100}%` }}
              />
              <span className="relative flex items-baseline gap-3 min-w-0">
                <span
                  className={`label-mono num-tabular ${
                    i === 0 ? "text-acid" : "text-mute"
                  }`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Link
                  href={`/escucha/cancion/${encodeURIComponent(t.key)}`}
                  className="truncate hover:text-acid transition-colors"
                >
                  {t.name}
                </Link>
              </span>
              <span className="relative label-mono text-mute num-tabular">
                {t.plays.toLocaleString("es")}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="hairline-b mt-auto" />
      <div className="px-5 sm:px-8 py-5 flex items-center justify-between label-mono text-mute">
        <span>ÁLBUM</span>
        <span>{ficha.plays.toLocaleString("es")} REPRODUCCIONES</span>
      </div>
    </main>
  );
}
