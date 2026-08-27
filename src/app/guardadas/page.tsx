import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMe, getLikedSongs, type SavedTrackItem } from "@/lib/spotify";
import { db } from "@/db";
import { trackKey } from "@/lib/stats/normalize";
import { getTrackHistory, type TrackHistory } from "@/lib/stats/track-history";
import TopBar from "@/components/TopBar";

const PAGE_SIZE = 50;

/**
 * `Date.now()` en el cuerpo de un componente lo veta `react-hooks/purity`: dos
 * renders darian resultados distintos. Mismo envoltorio que usan las demas
 * paginas.
 */
function ahoraMs(): number {
  return Date.now();
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  // A /biblioteca directamente: «/» es la portada de estadisticas y sin
  // sesion redirige aqui de todos modos, asi que ir por ella eran dos saltos.
  if (!session) redirect("/biblioteca");

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [me, liked] = await Promise.all([
    getMe(),
    getLikedSongs(PAGE_SIZE, offset),
  ]);

  // Cruce con el archivo de escuchas, solo de las cincuenta que se pintan.
  //
  // Es la pregunta que esta pantalla no podia responder: guardas miles de
  // canciones, pero ¿cuales suenan? Sin esto es un inventario; con esto se ve
  // que has guardado y nunca has puesto.
  const claves = new Map<string, string>();
  for (const it of liked.items) {
    const t = it.track;
    // Las pistas locales llegan sin id y sin nada con que cruzarlas.
    if (t?.id) claves.set(t.id, trackKey(t.artists[0]?.name ?? "", t.name));
  }
  const historia = await getTrackHistory(
    db,
    [...new Set(claves.values())],
    ahoraMs(),
  );

  const totalPages = Math.max(1, Math.ceil(liked.total / PAGE_SIZE));
  const startIndex = offset + 1;
  const endIndex = Math.min(offset + PAGE_SIZE, liked.total);

  return (
    <main className="min-h-screen flex flex-col">
      <TopBar me={me} active="guardadas" />

      <Header total={liked.total} />

      <section className="px-8 py-10">
        <div className="hairline-b pb-3 mb-2 grid grid-cols-[60px_56px_1fr_120px] md:grid-cols-[60px_56px_1fr_240px_80px_120px] gap-3 md:gap-6 label-mono text-mute">
          <span>№</span>
          <span></span>
          <span>Título / Artista</span>
          <span className="hidden md:block">Álbum</span>
          <span className="hidden md:block text-right">Duración</span>
          <span className="text-right">Guardada</span>
        </div>

        <ul>
          {liked.items.map((item, i) => (
            <TrackRow
              key={`${item.track.id ?? "local"}-${offset + i}`}
              item={item}
              index={offset + i + 1}
              clave={item.track.id ? claves.get(item.track.id) : undefined}
              historia={
                historia.get(
                  (item.track.id ? claves.get(item.track.id) : "") ?? "",
                ) ?? undefined
              }
            />
          ))}
        </ul>

        <Pagination
          page={page}
          totalPages={totalPages}
          startIndex={startIndex}
          endIndex={endIndex}
          total={liked.total}
        />
      </section>

      <footer className="hairline-b mt-auto" />
      <div className="px-8 py-5 flex items-center justify-between label-mono text-mute">
        <span>BIBLIOTECA · LIKED SONGS</span>
        <span>
          {liked.total.toLocaleString("es")} EN TOTAL · PÁGINA {page} / {totalPages}
        </span>
      </div>
    </main>
  );
}

/* ---------------------------------------------------------------- */

function Header({ total }: { total: number }) {
  return (
    <section className="px-8 py-16 lg:py-20 hairline-b">
      <div className="grid grid-cols-12 gap-6 items-end">
        <div className="col-span-12 lg:col-span-8 rise">
          <p className="label-mono text-acid mb-6">
            Volumen 02 — Tu biblioteca personal
          </p>
          <h1 className="display-italic text-[clamp(3.5rem,10vw,10rem)] leading-[0.9]">
            Liked
            <br />
            <span className="display not-italic text-cream-dim">Songs.</span>
          </h1>
          <p className="font-serif italic text-lg text-cream-dim mt-8 max-w-md">
            Las canciones que has guardado a lo largo del tiempo. La curaduría
            silenciosa de tus gustos.
          </p>
        </div>

        <div className="col-span-12 lg:col-span-4 flex flex-col items-end justify-end rise">
          <p className="label-mono text-mute mb-2">Canciones guardadas</p>
          <p
            className="display num-tabular text-[clamp(5rem,16vw,13rem)] text-acid leading-none"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 1' }}
          >
            {total.toLocaleString("es")}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */

function TrackRow({
  item,
  index,
  clave,
  historia,
}: {
  item: SavedTrackItem;
  index: number;
  clave?: string;
  historia?: TrackHistory;
}) {
  const t = item.track;
  if (!t) return null;
  const art = t.album?.images?.at(-1)?.url ?? t.album?.images?.[0]?.url;
  const artists = t.artists.map((a) => a.name).join(", ");
  const added = formatDate(item.added_at);

  return (
    <li className="group grid grid-cols-[40px_40px_1fr_72px] md:grid-cols-[60px_56px_1fr_240px_80px_120px] gap-3 md:gap-6 py-3 hairline-b items-center hover:bg-ink-2/40 transition-colors">
      <span className="label-mono num-tabular text-mute group-hover:text-acid transition-colors">
        {pad(index, 4)}
      </span>
      {/* Medida fija, asi que `width`/`height` y no `fill`: `fill` exige que el
          contenedor sea `relative` --este no lo era-- y su `sizes` estaba
          copiado de una rejilla, con lo que Next servia una imagen para un
          quinto del ancho de pantalla para pintarla a cuarenta pixeles. */}
      <div className="h-10 w-10 overflow-hidden rounded-md bg-ink-3 ring-1 ring-rule">
        {art && (
          <Image
            src={art}
            alt=""
            width={80}
            height={80}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="min-w-0">
        <p className="font-serif text-base text-cream truncate flex items-center gap-2">
          {clave && historia ? (
            <Link
              href={`/escucha/cancion/${encodeURIComponent(clave)}`}
              className="truncate transition-colors hover:text-acid"
            >
              {t.name}
            </Link>
          ) : (
            <span className="truncate">{t.name}</span>
          )}
          {t.explicit && (
            <span className="label-mono text-[9px] text-mute ring-1 ring-rule px-1 leading-4 shrink-0">
              E
            </span>
          )}
        </p>
        <p className="font-mono text-[11px] text-mute truncate mt-0.5">
          {artists}
        </p>
      </div>
      <p className="hidden md:block font-mono text-xs text-mute truncate">
        {t.album?.name}
      </p>
      <p className="hidden md:block font-mono text-xs text-mute num-tabular text-right">
        {formatShortDuration(t.duration_ms)}
      </p>
      <p className="dato-mono text-right text-mute">
        {/* Lo que guardas frente a lo que suena. Sin historia se dice, no se
            pinta un cero: «nunca» y «cero veces» son la misma cosa, pero un
            cero parece medido y esto es una ausencia. */}
        {historia ? (
          <>
            <span className="block text-cream-dim">
              {historia.plays.toLocaleString("es")}{" "}
              {historia.plays === 1 ? "vez" : "veces"}
            </span>
            <span className="block">{added}</span>
          </>
        ) : (
          <>
            <span className="block text-mute">nunca sonó</span>
            <span className="block">{added}</span>
          </>
        )}
      </p>
    </li>
  );
}

/* ---------------------------------------------------------------- */

function Pagination({
  page,
  totalPages,
  startIndex,
  endIndex,
  total,
}: {
  page: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  total: number;
}) {
  const prev = page > 1 ? `/guardadas?page=${page - 1}` : null;
  const next = page < totalPages ? `/guardadas?page=${page + 1}` : null;

  return (
    <nav className="mt-12 flex items-center justify-between hairline-b pt-6">
      <span className="label-mono text-mute num-tabular">
        {startIndex}–{endIndex} de {total.toLocaleString("es")}
      </span>

      <div className="flex items-center gap-6">
        {prev ? (
          <Link
            href={prev}
            className="label-mono text-cream hover:text-acid transition-colors"
          >
            ← Anterior
          </Link>
        ) : (
          <span className="label-mono text-rule">← Anterior</span>
        )}

        <span className="label-mono num-tabular text-mute">
          {page} / {totalPages}
        </span>

        {next ? (
          <Link
            href={next}
            className="label-mono text-cream hover:text-acid transition-colors"
          >
            Siguiente →
          </Link>
        ) : (
          <span className="label-mono text-rule">Siguiente →</span>
        )}
      </div>
    </nav>
  );
}

/* ---------------------------------------------------------------- */

function pad(n: number, len = 3) {
  return n.toString().padStart(len, "0");
}

function formatShortDuration(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = (d.getMonth() + 1).toString().padStart(2, "0");
  const da = d.getDate().toString().padStart(2, "0");
  return `${y}.${mo}.${da}`;
}
