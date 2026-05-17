import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import {
  getMe,
  getPlaylist,
  getPlaylistTracks,
  getAllMyPlaylists,
  type PlaylistDetail,
  type PlaylistTrackItem,
} from "@/lib/spotify";
import { getTagsForTracks } from "@/lib/tag-actions";
import TopBar from "@/components/TopBar";
import PlaylistTracksTable from "@/components/PlaylistTracksTable";

export default async function PlaylistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) return notFound();

  const { id } = await params;

  let tracksError: { status?: number } | null = null;
  let playlistError: (Error & { status?: number }) | null = null;
  const [me, playlist, firstPage, myPlaylists] = await Promise.all([
    getMe(),
    getPlaylist(id).catch((e) => {
      console.error("[getPlaylist]", e);
      playlistError = e;
      return null;
    }),
    getPlaylistTracks(id, 100, 0).catch((e: { status?: number }) => {
      console.error("[getPlaylistTracks]", e);
      tracksError = e;
      return { items: [] as PlaylistTrackItem[], total: 0, next: null };
    }),
    getAllMyPlaylists().catch(() => []),
  ]);

  if (!playlist) {
    // Re-throw so the global error.tsx renders a useful screen rather than 404.
    if (playlistError) throw playlistError;
    return notFound();
  }

  const ownedByMe = playlist.owner.id === me.id;
  const ownedPlaylists = myPlaylists.filter((p) => p.owner.id === me.id);
  const tracks = firstPage.items;
  const totalTracks = firstPage.total;
  const partial = tracks.length < totalTracks;

  // Fetch user-applied tags for the loaded tracks (local DB).
  const trackUris = tracks
    .map((it) => (it.item ?? it.track)?.uri)
    .filter((u): u is string => Boolean(u));
  const initialTagsByUri = await getTagsForTracks(trackUris).catch(() => ({}));

  const trackOf = (i: PlaylistTrackItem) => i.item ?? i.track ?? null;
  const totalMs = tracks.reduce(
    (s, t) => s + (trackOf(t)?.duration_ms ?? 0),
    0,
  );
  const explicitCount = tracks.filter((t) => trackOf(t)?.explicit).length;
  const uniqueArtists = new Set(
    tracks.flatMap((t) => trackOf(t)?.artists.map((a) => a.id) ?? []),
  ).size;

  return (
    <main className="min-h-screen flex flex-col">
      <TopBar me={me} />

      <div className="px-8 pt-6">
        <Link
          href="/"
          className="label-mono text-mute hover:text-acid transition-colors"
        >
          ← Volver al índice
        </Link>
      </div>

      <DetailHeader
        playlist={playlist}
        ownedByMe={ownedByMe}
        trackCount={totalTracks}
        loadedCount={tracks.length}
        partial={partial}
        totalMs={totalMs}
        uniqueArtists={uniqueArtists}
        explicitCount={explicitCount}
      />

      <section className="px-8 pt-12 pb-32">
        {tracks.length === 0 ? (
          <EmptyState tracksError={tracksError} />
        ) : (
          <>
            <div className="hidden md:grid grid-cols-[36px_60px_56px_1fr_280px_80px_120px] gap-6 hairline-b pb-3 mb-2 label-mono text-mute">
              <span></span>
              <span>№</span>
              <span></span>
              <span>Título / Artista</span>
              <span>Álbum</span>
              <span className="text-right">Duración</span>
              <span className="text-right">Añadido</span>
            </div>

            <PlaylistTracksTable
              playlistId={playlist.id}
              playlistName={playlist.name}
              ownedByMe={ownedByMe}
              initialTracks={tracks}
              totalTracks={totalTracks}
              myPlaylists={ownedPlaylists}
              initialTagsByUri={initialTagsByUri}
            />
          </>
        )}
      </section>

      <footer className="hairline-b" />
      <div className="px-8 py-5 flex items-center justify-between label-mono text-mute">
        <span>FIN DE LA LISTA</span>
        <span>
          {tracks.length} CANCIONES · {formatLongDuration(totalMs)}
        </span>
      </div>
    </main>
  );
}

/* ---------------------------------------------------------------- */

function EmptyState({
  tracksError,
}: {
  tracksError: { status?: number } | null;
}) {
  if (tracksError && (tracksError as { status?: number }).status === 403) {
    return (
      <div className="py-20 text-center max-w-2xl mx-auto">
        <p className="label-mono text-blood mb-4">403 — Acceso restringido</p>
        <p className="font-serif italic text-2xl text-cream-dim mb-4 [text-wrap:balance]">
          Spotify no permite leer las canciones de esta playlist.
        </p>
        <p className="font-mono text-xs text-mute leading-relaxed">
          Esta es una playlist seguida de otro usuario o una curaduría de
          Spotify. Para tus propias playlists sí funciona el detalle completo.
        </p>
      </div>
    );
  }
  return (
    <p className="font-serif italic text-mute py-20 text-center">
      Esta playlist está vacía.
    </p>
  );
}

/* ---------------------------------------------------------------- */

function DetailHeader({
  playlist,
  ownedByMe,
  trackCount,
  loadedCount,
  partial,
  totalMs,
  uniqueArtists,
  explicitCount,
}: {
  playlist: PlaylistDetail;
  ownedByMe: boolean;
  trackCount: number;
  loadedCount: number;
  partial: boolean;
  totalMs: number;
  uniqueArtists: number;
  explicitCount: number;
}) {
  const cover = playlist.images?.[0]?.url;

  return (
    <section className="px-8 py-12 hairline-b">
      <div className="grid grid-cols-12 gap-8 items-end">
        <div className="col-span-12 md:col-span-4 lg:col-span-3 fade-in">
          <div className="aspect-square relative bg-ink-2 ring-1 ring-rule overflow-hidden">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center display-italic text-7xl text-mute">
                ♪
              </div>
            )}
            <div className="absolute top-2 left-2 label-mono text-cream mix-blend-difference">
              {playlist.public ? "PÚBLICA" : "PRIVADA"}
              {playlist.collaborative && " · COLLAB"}
            </div>
          </div>
        </div>

        <div className="col-span-12 md:col-span-8 lg:col-span-9 fade-in">
          <p className="label-mono text-acid mb-4">
            Por {playlist.owner.display_name}
            {ownedByMe && <span className="text-mute"> · TUYA</span>}
            {playlist.followers?.total > 0 && (
              <>
                <span className="text-mute"> · </span>
                <span className="text-mute num-tabular">
                  {playlist.followers.total.toLocaleString("es")} seguidores
                </span>
              </>
            )}
          </p>
          <h1 className="display-italic text-[clamp(3rem,8vw,8rem)] [text-wrap:balance]">
            {playlist.name}
          </h1>
          {playlist.description && (
            <p
              className="font-serif italic text-cream-dim text-lg mt-6 max-w-2xl"
              dangerouslySetInnerHTML={{ __html: playlist.description }}
            />
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-6 mt-10 max-w-2xl">
            <Stat label="Canciones" value={trackCount.toLocaleString("es")} />
            <Stat
              label={partial ? "Duración (parcial)" : "Duración"}
              value={formatShortDuration(totalMs)}
            />
            <Stat
              label={partial ? "Artistas (parcial)" : "Artistas únicos"}
              value={uniqueArtists.toLocaleString("es")}
            />
            <Stat
              label={partial ? "Explícitas (parcial)" : "Explícitas"}
              value={explicitCount.toLocaleString("es")}
            />
          </div>
          {partial && (
            <p className="font-mono text-[11px] text-mute mt-4 max-w-2xl">
              Mostrando primeras {loadedCount.toLocaleString("es")} de{" "}
              {trackCount.toLocaleString("es")}. Carga más abajo para completar
              las estadísticas.
            </p>
          )}

          {playlist.external_urls?.spotify && (
            <a
              href={playlist.external_urls.spotify}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center gap-3 mt-10 ring-1 ring-rule px-5 py-3 hover:bg-acid hover:text-ink hover:ring-acid transition-all"
            >
              <span className="label-mono">Abrir en Spotify</span>
              <span className="font-mono text-sm transition-transform duration-300 group-hover:translate-x-1">
                ↗
              </span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-mono text-mute mb-1.5">{label}</p>
      <p className="display num-tabular text-3xl text-cream">{value}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function formatShortDuration(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatLongDuration(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}H ${m}M`;
  return `${m}M`;
}
