import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";
import { getMe, getAllMyPlaylists, type SpotifyPlaylist, type SpotifyUser } from "@/lib/spotify";
import TopBar from "@/components/TopBar";
import CreatePlaylistButton from "@/components/CreatePlaylistDialog";
import MergePlaylistsButton from "@/components/MergePlaylistsDialog";

type FilterKey = "todas" | "mias" | "seguidas" | "collab";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const session = await auth();

  if (!session) return <LoginScreen />;

  if (session.error === "RefreshTokenError") {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="max-w-sm text-center">
          <p className="label-mono text-mute mb-4">Sesión expirada</p>
          <p className="display-italic text-3xl mb-6">Vuelve a entrar.</p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="label-mono text-acid hover:text-cream transition">
              Cerrar sesión —&gt;
            </button>
          </form>
        </div>
      </main>
    );
  }

  const [me, playlists] = await Promise.all([getMe(), getAllMyPlaylists()]);
  const params = await searchParams;
  const filter = (
    ["todas", "mias", "seguidas", "collab"].includes(params.f ?? "")
      ? params.f
      : "todas"
  ) as FilterKey;

  return <Library me={me} playlists={playlists} filter={filter} />;
}

/* ---------------------------------------------------------------- */

function LoginScreen() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-8 py-6 flex items-center justify-between hairline-b">
        <span className="label-mono text-cream">
          LEDGER <span className="text-mute">·</span>{" "}
          <span className="text-mute">001</span>
        </span>
        <span className="label-mono text-mute">EST. MMXXVI</span>
      </header>

      <section className="flex-1 grid lg:grid-cols-12 gap-12 px-8 py-16 lg:py-24">
        <div className="lg:col-span-7 lg:col-start-2 flex flex-col justify-center fade-in">
          <p className="label-mono text-acid mb-8">
            № 01 — Una nueva forma de mirar tu música
          </p>
          <h1 className="display-italic text-[clamp(3.5rem,9vw,9rem)] mb-8">
            Tu biblioteca,
            <br />
            <span className="display text-cream-dim not-italic">ordenada</span>
            <br />
            <span className="display-italic">con criterio.</span>
          </h1>
          <p className="font-serif text-xl text-cream-dim max-w-md leading-relaxed mb-12">
            Un organizador editorial para tu biblioteca de Spotify. Playlists,
            géneros, ritmos, tags. Sin algoritmos. Solo tú.
          </p>
          <form
            action={async () => {
              "use server";
              await signIn("spotify", { redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="group inline-flex items-center gap-4 bg-acid text-ink px-7 py-4 hover:bg-cream transition-colors duration-300"
            >
              <span className="label-mono">Entrar con Spotify</span>
              <span className="font-mono text-sm transition-transform duration-300 group-hover:translate-x-1">
                ──&gt;
              </span>
            </button>
          </form>
        </div>

        <aside className="lg:col-span-3 lg:col-start-10 flex flex-col justify-end gap-3 text-right">
          <p className="label-mono text-mute">Colofón</p>
          <p className="font-mono text-xs text-cream-dim leading-relaxed">
            Construido sobre la API de Spotify y Last.fm.
            <br />
            Sin trackers. Sin nube ajena.
            <br />
            Tus datos viven en tu máquina.
          </p>
        </aside>
      </section>

      <footer className="hairline-b mt-auto" />
      <div className="px-8 py-4 flex items-center justify-between label-mono text-mute">
        <span>① / ① — INTRO</span>
        <span>↓ DESPLAZA PARA NADA</span>
      </div>
    </main>
  );
}

/* ---------------------------------------------------------------- */

function Library({
  me,
  playlists,
  filter,
}: {
  me: SpotifyUser;
  playlists: SpotifyPlaylist[];
  filter: FilterKey;
}) {
  const total = playlists.length;
  const owned = playlists.filter((p) => p.owner.id === me.id);
  const followed = playlists.filter((p) => p.owner.id !== me.id);
  const collab = playlists.filter((p) => p.collaborative);
  const totalTracks = playlists.reduce((s, p) => s + (p.items?.total ?? 0), 0);

  // Pick a featured playlist: the user's owned playlist with the most tracks.
  const featured =
    [...owned].sort((a, b) => (b.items?.total ?? 0) - (a.items?.total ?? 0))[0] ??
    playlists[0];

  // Filter the grid (featured stays at top regardless).
  const visible =
    filter === "mias"
      ? owned
      : filter === "seguidas"
        ? followed
        : filter === "collab"
          ? collab
          : playlists;

  return (
    <main className="min-h-screen flex flex-col">
      <TopBar me={me} active="index" />

      <EditorialHeader total={total} />

      <Marquee />

      <Stats
        total={total}
        owned={owned.length}
        followed={followed.length}
        collab={collab.length}
        totalTracks={totalTracks}
      />

      {featured && <Featured playlist={featured} />}

      <section className="px-8 pt-16 pb-24">
        <div className="hairline-b pb-4 mb-10">
          <div className="flex items-baseline justify-between mb-5 flex-wrap gap-y-3">
            <h2 className="label-mono text-acid">
              Índice <span className="text-mute">/ 001 — {pad(total)}</span>
            </h2>
            <p className="label-mono text-mute hidden md:block">
              ORDEN POR DEFECTO · ALFABÉTICO
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <FilterChips
              current={filter}
              counts={{
                todas: total,
                mias: owned.length,
                seguidas: followed.length,
                collab: collab.length,
              }}
            />
            <div className="flex items-center gap-2">
              <MergePlaylistsButton playlists={owned} />
              <CreatePlaylistButton />
            </div>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="font-serif italic text-mute py-16 text-center">
            No hay playlists en esta vista.
          </p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-6 gap-y-14">
            {visible.map((p, i) => (
              <PlaylistCard
                key={p.id}
                playlist={p}
                index={i + 1}
                ownedByMe={p.owner.id === me.id}
              />
            ))}
          </ul>
        )}
      </section>

      <footer className="hairline-b" />
      <div className="px-8 py-5 flex items-center justify-between label-mono text-mute">
        <span>FIN DEL ÍNDICE</span>
        <span>{pad(visible.length)} VISIBLES · LEDGER № 001</span>
      </div>
    </main>
  );
}

/* ---------------------------------------------------------------- */

function Marquee() {
  const phrases = [
    "Catalogada con cuidado",
    "★",
    "Donde Spotify falla, tú decides",
    "✦",
    "Editorialmente tuya",
    "♪",
    "El silencio entre dos canciones también cuenta",
    "✦",
    "Volumen 01",
    "★",
  ];
  const line = phrases.join("   /   ");
  return (
    <div className="hairline-b py-5 overflow-hidden bg-ink-2/30">
      <div className="marquee-track flex whitespace-nowrap">
        {[0, 1].map((k) => (
          <span
            key={k}
            className="display-italic text-2xl text-cream-dim/60 px-6 shrink-0"
          >
            {line} &nbsp;/&nbsp;
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function Featured({ playlist }: { playlist: SpotifyPlaylist }) {
  const cover = playlist.images?.[0]?.url;
  const tracks = playlist.items?.total ?? 0;
  return (
    <section className="px-8 py-14 hairline-b bg-gradient-to-br from-ink via-ink to-ink-2/40">
      <div className="grid grid-cols-12 gap-8 items-center">
        <Link
          href={`/playlist/${playlist.id}`}
          className="col-span-12 md:col-span-5 lg:col-span-4 group"
        >
          <div className="relative aspect-square overflow-hidden ring-1 ring-rule">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt=""
                className="w-full h-full object-cover saturate-[0.7] group-hover:saturate-100 group-hover:scale-[1.02] transition-all duration-700 ease-out"
              />
            ) : (
              <div className="w-full h-full bg-ink-2 flex items-center justify-center">
                <span className="display-italic text-7xl text-mute">♪</span>
              </div>
            )}
            <div className="absolute top-3 left-3 label-mono text-cream mix-blend-difference">
              FEATURED · № 001
            </div>
            <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-ink/90 via-ink/40 to-transparent" />
          </div>
        </Link>

        <div className="col-span-12 md:col-span-7 lg:col-span-8">
          <p className="label-mono text-acid mb-4">
            Pieza destacada — más extensa de tu colección
          </p>
          <Link
            href={`/playlist/${playlist.id}`}
            className="group inline-block"
          >
            <h2 className="display-italic text-[clamp(2.75rem,6vw,6rem)] leading-[0.95] [text-wrap:balance] group-hover:text-acid transition-colors duration-500">
              {playlist.name}
            </h2>
          </Link>
          {playlist.description && (
            <p
              className="font-serif italic text-cream-dim text-lg mt-5 max-w-xl line-clamp-3"
              dangerouslySetInnerHTML={{ __html: playlist.description }}
            />
          )}
          <div className="mt-7 flex flex-wrap gap-x-10 gap-y-4">
            <FeaturedStat label="Canciones" value={tracks.toLocaleString("es")} />
            <FeaturedStat
              label="Visibilidad"
              value={playlist.public ? "Pública" : "Privada"}
            />
            <FeaturedStat label="Autor" value={playlist.owner.display_name} />
          </div>
          <div className="mt-8 flex gap-3 flex-wrap">
            <Link
              href={`/playlist/${playlist.id}`}
              className="group inline-flex items-center gap-3 bg-acid text-ink px-5 py-3 hover:bg-cream transition-colors"
            >
              <span className="label-mono">Abrir índice</span>
              <span className="font-mono text-sm group-hover:translate-x-1 transition-transform">
                →
              </span>
            </Link>
            {playlist.external_urls?.spotify && (
              <a
                href={playlist.external_urls.spotify}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-3 ring-1 ring-rule px-5 py-3 hover:ring-cream transition-all"
              >
                <span className="label-mono text-cream">En Spotify</span>
                <span className="font-mono text-sm text-mute group-hover:text-cream transition-colors">
                  ↗
                </span>
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturedStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-mono text-mute mb-1">{label}</p>
      <p className="font-serif text-xl text-cream truncate max-w-[18ch]">
        {value}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function FilterChips({
  current,
  counts,
}: {
  current: FilterKey;
  counts: Record<FilterKey, number>;
}) {
  const items: { key: FilterKey; label: string }[] = [
    { key: "todas", label: "Todas" },
    { key: "mias", label: "Mías" },
    { key: "seguidas", label: "Seguidas" },
    { key: "collab", label: "Colab" },
  ];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {items.map((it) => {
        const active = current === it.key;
        const href = it.key === "todas" ? "/" : `/?f=${it.key}`;
        return (
          <Link
            key={it.key}
            href={href}
            className={`label-mono inline-flex items-center gap-2 px-3 py-1.5 ring-1 transition-all ${
              active
                ? "bg-acid text-ink ring-acid"
                : "ring-rule text-mute hover:ring-cream hover:text-cream"
            }`}
          >
            <span>{it.label}</span>
            <span className="num-tabular text-[10px] opacity-70">
              {counts[it.key]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- */

function EditorialHeader({ total }: { total: number }) {
  return (
    <section className="px-8 py-16 lg:py-24 hairline-b">
      <div className="grid grid-cols-12 gap-6 items-end">
        <div className="col-span-12 lg:col-span-8 fade-in">
          <p className="label-mono text-acid mb-6">
            Volumen 01 — Índice de la biblioteca
          </p>
          <h1 className="display-italic text-[clamp(4rem,12vw,12rem)]">
            Tu
            <br />
            biblioteca.
          </h1>
          <p className="font-serif text-lg text-cream-dim italic mt-8 max-w-md">
            Cada disco que has guardado, cada lista que has hecho. Aquí, sin
            ruido.
          </p>
        </div>

        <div className="col-span-12 lg:col-span-4 flex flex-col items-end justify-end fade-in">
          <p className="label-mono text-mute mb-2">Entradas totales</p>
          <p
            className="display num-tabular text-[clamp(6rem,18vw,15rem)] text-acid leading-none"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 1' }}
          >
            {pad(total)}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */

function Stats({
  total,
  owned,
  followed,
  collab,
  totalTracks,
}: {
  total: number;
  owned: number;
  followed: number;
  collab: number;
  totalTracks: number;
}) {
  const cells = [
    { label: "Tuyas", value: owned, hint: "creadas por ti" },
    { label: "Seguidas", value: followed, hint: "de otros usuarios" },
    { label: "Colaborativas", value: collab, hint: "edición compartida" },
    { label: "Canciones", value: totalTracks, hint: "suma total" },
  ];

  return (
    <section className="px-8 pt-12 hairline-b pb-12">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-10">
        {cells.map((c, i) => (
          <div
            key={c.label}
            className="rise"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <p className="label-mono text-mute mb-3">{c.label}</p>
            <p className="display num-tabular text-5xl md:text-6xl text-cream tracking-tight">
              {c.value.toLocaleString("es")}
            </p>
            <p className="label-mono text-mute mt-3 normal-case tracking-normal text-[11px]">
              {c.hint}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */

function PlaylistCard({
  playlist,
  index,
  ownedByMe,
}: {
  playlist: SpotifyPlaylist;
  index: number;
  ownedByMe: boolean;
}) {
  const cover = playlist.images?.[0]?.url;
  const tracks = playlist.items?.total ?? 0;
  const owner = playlist.owner.display_name || playlist.owner.id;

  const status = playlist.collaborative
    ? { label: "COLAB", classes: "text-acid ring-acid/40" }
    : ownedByMe
      ? { label: "TUYA", classes: "text-acid ring-acid/40" }
      : { label: "SEGUIDA", classes: "text-mute ring-rule" };

  return (
    <li
      className="group rise relative"
      style={{ animationDelay: `${Math.min(index * 10, 480)}ms` }}
    >
      {/* Index above the cover, magazine-style */}
      <div className="flex items-baseline justify-between mb-2 hairline-b pb-1">
        <span className="label-mono num-tabular text-mute group-hover:text-acid transition-colors text-[11px]">
          № {pad(index)}
        </span>
        <span
          className={`label-mono text-[9px] ring-1 px-1.5 py-0.5 ${status.classes}`}
        >
          {status.label}
        </span>
      </div>

      <Link href={`/playlist/${playlist.id}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-ink-2 ring-1 ring-rule">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover saturate-[0.55] group-hover:saturate-100 group-hover:scale-[1.04] transition-all duration-500 ease-out"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="display-italic text-5xl text-mute">♪</span>
            </div>
          )}

          {/* Decorative corner brackets */}
          <span className="absolute top-1.5 left-1.5 w-2.5 h-2.5 border-l border-t border-cream/70 group-hover:border-acid transition-colors" />
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 border-r border-t border-cream/70 group-hover:border-acid transition-colors" />
          <span className="absolute bottom-1.5 left-1.5 w-2.5 h-2.5 border-l border-b border-cream/70 group-hover:border-acid transition-colors" />
          <span className="absolute bottom-1.5 right-1.5 w-2.5 h-2.5 border-r border-b border-cream/70 group-hover:border-acid transition-colors" />

          {/* Hover overlay with meta */}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink/90 via-ink/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-100">
            <span className="label-mono text-acid num-tabular">
              {tracks.toLocaleString("es")} TR
            </span>
            <span className="label-mono text-cream">ABRIR ↗</span>
          </div>
        </div>

        <div className="mt-3 flex flex-col">
          <h3 className="relative inline-block font-serif text-lg leading-tight tracking-tight text-cream line-clamp-2 [text-wrap:balance]">
            <span className="bg-[linear-gradient(to_right,var(--color-acid),var(--color-acid))] bg-no-repeat bg-[length:0%_1px] bg-[position:0_100%] group-hover:bg-[length:100%_1px] transition-[background-size] duration-500 group-hover:text-acid transition-colors">
              {playlist.name || "Sin título"}
            </span>
          </h3>
          <div className="mt-2 flex items-center justify-between label-mono text-mute">
            <span className="num-tabular text-cream-dim">
              {tracks.toLocaleString("es")} TR
            </span>
            <span className="truncate ml-3 normal-case tracking-normal font-mono text-[10px]">
              {owner}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}

/* ---------------------------------------------------------------- */

function pad(n: number) {
  return n.toString().padStart(3, "0");
}
