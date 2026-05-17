"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchLikedPage } from "@/lib/spotify-actions";
import { getArtistGenres } from "@/lib/genre-actions";
import {
  clearLikedCache,
  getCachedLikedTracks,
  saveLikedTracks,
  type CachedTrack,
} from "@/lib/liked-cache";

const PAGE_SIZE = 50;
// Conservative throttle to stay well under Spotify's 180 req/30s window even
// when genre analysis or other scans run in parallel.
const PAGE_THROTTLE_MS = 300;

type RawTrack = {
  uri: string;
  name: string;
  duration_ms: number;
  explicit: boolean;
  added_at: string;
  artists: { id: string; name: string }[];
  album: { id: string; name: string; images: { url: string }[] };
};

export default function StatsScanner({ total }: { total: number }) {
  const [scanning, setScanning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total });
  const [tracks, setTracks] = useState<RawTrack[]>([]);
  const [cacheScannedAt, setCacheScannedAt] = useState<number | null>(null);
  const [loadingCache, setLoadingCache] = useState(true);
  const [analyzingGenres, setAnalyzingGenres] = useState(false);
  const [genreMap, setGenreMap] = useState<Record<string, string[]> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  // On mount, attempt to load cached results from the local DB so the user
  // sees their stats instantly without any Spotify calls.
  useEffect(() => {
    let cancelled = false;
    getCachedLikedTracks()
      .then(({ tracks: cached, scannedAt }) => {
        if (cancelled) return;
        if (cached.length > 0) {
          setTracks(cached.map(toRawTrack));
          setCacheScannedAt(scannedAt);
          setDone(true);
          setProgress({ done: cached.length, total: cached.length });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingCache(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const startScan = async () => {
    setScanning(true);
    setDone(false);
    setError(null);
    setTracks([]);
    setGenreMap(null);
    cancelRef.current = false;
    setProgress({ done: 0, total });

    try {
      let offset = 0;
      const collected: RawTrack[] = [];
      let first = true;
      while (true) {
        if (cancelRef.current) break;
        if (!first) await sleep(PAGE_THROTTLE_MS);
        first = false;
        const page = await fetchLikedPage(offset, PAGE_SIZE);
        for (const it of page.items) {
          const t = it.track;
          if (!t) continue;
          collected.push({
            uri: t.uri,
            name: t.name,
            duration_ms: t.duration_ms,
            explicit: t.explicit,
            added_at: it.added_at,
            artists: t.artists,
            album: t.album,
          });
        }
        offset += page.items.length;
        setProgress({ done: Math.min(offset, page.total), total: page.total });
        // Update partial results every few pages so user sees progress
        if (offset % 250 === 0 || offset >= page.total) {
          setTracks([...collected]);
        }
        if (offset >= page.total || page.items.length === 0) break;
      }
      setTracks([...collected]);

      // Persist to local DB so subsequent visits are instant.
      try {
        const cacheable: CachedTrack[] = collected.map((t) => ({
          uri: t.uri,
          name: t.name,
          artists: t.artists,
          album: {
            id: t.album?.id ?? "",
            name: t.album?.name ?? "",
            image: t.album?.images?.at(-1)?.url,
          },
          duration_ms: t.duration_ms,
          explicit: t.explicit,
          added_at: t.added_at,
        }));
        await saveLikedTracks(cacheable);
        setCacheScannedAt(Date.now());
      } catch (e) {
        console.warn("[stats] failed to persist cache:", e);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al escanear");
    } finally {
      setScanning(false);
      setDone(true);
    }
  };

  const wipeCache = async () => {
    if (
      !confirm(
        "Borrar el cache local de Liked Songs? La próxima vez que abras Stats hará escaneo completo a Spotify.",
      )
    )
      return;
    await clearLikedCache();
    setTracks([]);
    setCacheScannedAt(null);
    setDone(false);
    setProgress({ done: 0, total });
  };

  const cancel = () => {
    cancelRef.current = true;
  };

  // Aggregations from `tracks`
  const stats = useMemo(() => computeStats(tracks), [tracks]);

  const analyzeGenres = async () => {
    if (tracks.length === 0) return;
    setAnalyzingGenres(true);
    try {
      const inputs: { id: string; name: string }[] = [];
      const seen = new Set<string>();
      for (const t of tracks) {
        for (const a of t.artists) {
          if (a.id && !seen.has(a.id)) {
            seen.add(a.id);
            inputs.push({ id: a.id, name: a.name });
          }
        }
      }
      const accumulated: Record<string, string[]> = {};
      const CHUNK = 30;
      for (let i = 0; i < inputs.length; i += CHUNK) {
        const slice = inputs.slice(i, i + CHUNK);
        const part = await getArtistGenres(slice);
        Object.assign(accumulated, part);
        setGenreMap({ ...accumulated });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al analizar géneros");
    } finally {
      setAnalyzingGenres(false);
    }
  };

  const genreCounts = useMemo(
    () => computeGenreCounts(tracks, genreMap),
    [tracks, genreMap],
  );

  return (
    <>
      {/* Scan controls */}
      <section className="px-8 py-10 hairline-b">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="min-w-0">
            <h2 className="label-mono text-acid mb-2">Control</h2>
            <p className="font-serif text-cream-dim italic max-w-xl">
              {loadingCache
                ? "Cargando cache local…"
                : scanning
                  ? "Recogiendo tus Liked Songs…"
                  : tracks.length > 0
                    ? cacheScannedAt
                      ? `Datos en cache · escaneados ${formatRelativeTime(cacheScannedAt)}.`
                      : "Análisis listo."
                    : "Pulsa escanear para construir tu retrato editorial."}
            </p>
            {cacheScannedAt && !scanning && (
              <p className="font-mono text-[11px] text-mute mt-1">
                Las stats salen del cache local — sin peticiones a Spotify
                hasta que refresques.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {tracks.length > 0 && !scanning && (
              <button
                onClick={wipeCache}
                className="label-mono text-mute hover:text-blood transition-colors px-2"
                title="Borrar cache local"
              >
                Borrar cache
              </button>
            )}
            {scanning ? (
              <button
                onClick={cancel}
                className="ring-1 ring-blood/60 text-blood px-5 py-2.5 label-mono hover:bg-blood/10 transition-colors"
              >
                Detener
              </button>
            ) : (
              <button
                onClick={startScan}
                disabled={total === 0}
                className="group inline-flex items-center gap-3 bg-acid text-ink px-5 py-2.5 hover:bg-cream transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="label-mono">
                  {tracks.length > 0
                    ? "Refrescar desde Spotify"
                    : "Iniciar escaneo"}
                </span>
                <span className="font-mono text-sm group-hover:rotate-180 transition-transform duration-500">
                  ↻
                </span>
              </button>
            )}
          </div>
        </div>

        {(scanning || tracks.length > 0) && (
          <div className="mt-8">
            <div className="flex items-baseline justify-between label-mono text-mute mb-2">
              <span className="num-tabular">
                {progress.done.toLocaleString("es")} /{" "}
                {progress.total.toLocaleString("es")} canciones
              </span>
              <span className="text-cream-dim normal-case tracking-normal font-mono text-[11px] italic">
                {scanning ? "leyendo Spotify…" : "completo"}
              </span>
            </div>
            <div className="h-1 bg-rule overflow-hidden">
              <div
                className="h-full bg-acid transition-all duration-300"
                style={{
                  width: `${
                    progress.total > 0
                      ? (progress.done / progress.total) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="mt-6 label-mono text-blood ring-1 ring-blood/40 bg-blood/10 px-3 py-2">
            {error}
          </p>
        )}
      </section>

      {/* Big numbers */}
      {tracks.length > 0 && (
        <BigNumbers stats={stats} />
      )}

      {/* Top artists */}
      {tracks.length > 0 && (
        <RankList
          label="Top artistas"
          subtitle="Quién más aparece en tu biblioteca"
          rows={stats.topArtists}
          formatValue={(n) => `${n.toLocaleString("es")} TR`}
        />
      )}

      {/* Top albums */}
      {tracks.length > 0 && (
        <RankList
          label="Top álbumes"
          subtitle="Discos que más has guardado por dentro"
          rows={stats.topAlbums}
          formatValue={(n) => `${n.toLocaleString("es")} TR`}
        />
      )}

      {/* Top genres (requires extra step) */}
      {tracks.length > 0 && (
        <section className="px-8 py-12 hairline-b">
          <div className="flex items-baseline justify-between mb-6 flex-wrap gap-2">
            <div>
              <p className="label-mono text-acid mb-2">Top géneros</p>
              <h3 className="display-italic text-3xl">El sonido dominante.</h3>
            </div>
            {!genreMap && !analyzingGenres && (
              <button
                onClick={analyzeGenres}
                className="group inline-flex items-center gap-2 bg-acid text-ink px-4 py-2 hover:bg-cream transition-colors"
              >
                <span className="label-mono">Analizar géneros</span>
                <span className="font-mono text-sm group-hover:rotate-180 transition-transform duration-500">
                  ↻
                </span>
              </button>
            )}
            {analyzingGenres && (
              <span className="label-mono text-mute italic">analizando…</span>
            )}
          </div>
          {genreCounts && genreCounts.length > 0 ? (
            <Bars rows={genreCounts.slice(0, 15)} />
          ) : genreMap && genreCounts && genreCounts.length === 0 ? (
            <p className="font-serif italic text-mute">
              Sin géneros etiquetados disponibles.
            </p>
          ) : (
            <p className="font-mono text-xs text-mute">
              {analyzingGenres
                ? "Consultando Last.fm + Spotify para cada artista…"
                : "Pulsa “Analizar géneros” para enriquecer."}
            </p>
          )}
        </section>
      )}

      {/* Time evolution */}
      {tracks.length > 0 && stats.byYear.length > 0 && (
        <section className="px-8 py-12 hairline-b">
          <div className="mb-6">
            <p className="label-mono text-acid mb-2">Evolución temporal</p>
            <h3 className="display-italic text-3xl">
              Cuándo guardas más música.
            </h3>
          </div>
          <Timeline rows={stats.byYear} />
        </section>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- */

function BigNumbers({
  stats,
}: {
  stats: ReturnType<typeof computeStats>;
}) {
  const cells = [
    {
      label: "Canciones",
      value: stats.totalTracks.toLocaleString("es"),
    },
    {
      label: "Artistas únicos",
      value: stats.uniqueArtists.toLocaleString("es"),
    },
    {
      label: "Álbumes únicos",
      value: stats.uniqueAlbums.toLocaleString("es"),
    },
    {
      label: "Horas de música",
      value: Math.round(stats.totalMs / 1000 / 3600).toLocaleString("es"),
    },
    {
      label: "Explícitas",
      value: stats.explicit.toLocaleString("es"),
    },
    {
      label: "Promedio min/canción",
      value: (stats.totalTracks > 0
        ? stats.totalMs / stats.totalTracks / 1000 / 60
        : 0
      ).toFixed(1),
    },
  ];
  return (
    <section className="px-8 py-12 hairline-b">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-10">
        {cells.map((c, i) => (
          <div
            key={c.label}
            className="rise"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <p className="label-mono text-mute mb-3">{c.label}</p>
            <p className="display num-tabular text-5xl md:text-6xl text-cream tracking-tight">
              {c.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RankList({
  label,
  subtitle,
  rows,
  formatValue,
}: {
  label: string;
  subtitle: string;
  rows: { key: string; name: string; secondary?: string; value: number }[];
  formatValue: (n: number) => string;
}) {
  if (rows.length === 0) return null;
  const max = rows[0]?.value ?? 1;
  return (
    <section className="px-8 py-12 hairline-b">
      <div className="mb-6">
        <p className="label-mono text-acid mb-2">{label}</p>
        <h3 className="display-italic text-3xl">{subtitle}.</h3>
      </div>
      <ol className="space-y-3">
        {rows.slice(0, 10).map((r, i) => (
          <li
            key={r.key}
            className="grid grid-cols-[40px_1fr_auto] gap-4 items-baseline"
          >
            <span className="label-mono num-tabular text-mute">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="relative">
              <p className="font-serif text-lg text-cream truncate">
                {r.name}
                {r.secondary && (
                  <span className="font-mono text-[11px] text-mute ml-2">
                    {r.secondary}
                  </span>
                )}
              </p>
              <div
                className="h-px bg-acid/60 mt-2"
                style={{ width: `${(r.value / max) * 100}%` }}
              />
            </div>
            <span className="label-mono num-tabular text-cream-dim">
              {formatValue(r.value)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Bars({
  rows,
}: {
  rows: { name: string; value: number }[];
}) {
  if (rows.length === 0) return null;
  const max = rows[0]?.value ?? 1;
  return (
    <ol className="space-y-2">
      {rows.map((r, i) => (
        <li
          key={r.name}
          className="grid grid-cols-[200px_1fr_60px] md:grid-cols-[260px_1fr_60px] gap-4 items-center"
        >
          <span className="font-serif text-sm text-cream truncate">
            <span className="label-mono text-mute mr-2 num-tabular">
              {String(i + 1).padStart(2, "0")}
            </span>
            {r.name}
          </span>
          <div className="h-2 bg-ink-2 ring-1 ring-rule overflow-hidden">
            <div
              className="h-full bg-acid"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
          <span className="label-mono num-tabular text-mute text-right">
            {r.value}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Timeline({
  rows,
}: {
  rows: { year: number; count: number }[];
}) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="flex items-end gap-2 h-44 pb-4 border-b border-rule">
      {rows.map((r) => {
        const h = (r.count / max) * 100;
        return (
          <div
            key={r.year}
            className="flex-1 min-w-0 flex flex-col items-center gap-1 group"
          >
            <span className="label-mono num-tabular text-mute text-[9px] opacity-0 group-hover:opacity-100 transition-opacity">
              {r.count}
            </span>
            <div
              className="w-full bg-acid/70 group-hover:bg-acid transition-colors min-h-[2px]"
              style={{ height: `${h}%` }}
            />
            <span className="label-mono num-tabular text-mute text-[9px]">
              {String(r.year).slice(-2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- */

function computeStats(tracks: RawTrack[]) {
  const artistCounts = new Map<
    string,
    { name: string; count: number }
  >();
  const albumCounts = new Map<
    string,
    { name: string; artist: string; count: number }
  >();
  const yearCounts = new Map<number, number>();
  const uniqueArtists = new Set<string>();
  const uniqueAlbums = new Set<string>();
  let totalMs = 0;
  let explicit = 0;

  for (const t of tracks) {
    totalMs += t.duration_ms;
    if (t.explicit) explicit++;
    for (const a of t.artists) {
      uniqueArtists.add(a.id);
      const existing = artistCounts.get(a.id);
      if (existing) existing.count++;
      else artistCounts.set(a.id, { name: a.name, count: 1 });
    }
    if (t.album?.id) {
      uniqueAlbums.add(t.album.id);
      const existing = albumCounts.get(t.album.id);
      if (existing) existing.count++;
      else
        albumCounts.set(t.album.id, {
          name: t.album.name,
          artist: t.artists[0]?.name ?? "",
          count: 1,
        });
    }
    if (t.added_at) {
      const y = new Date(t.added_at).getFullYear();
      if (!Number.isNaN(y)) {
        yearCounts.set(y, (yearCounts.get(y) ?? 0) + 1);
      }
    }
  }

  const topArtists = Array.from(artistCounts, ([id, v]) => ({
    key: id,
    name: v.name,
    value: v.count,
  })).sort((a, b) => b.value - a.value);

  const topAlbums = Array.from(albumCounts, ([id, v]) => ({
    key: id,
    name: v.name,
    secondary: v.artist,
    value: v.count,
  })).sort((a, b) => b.value - a.value);

  const byYear = Array.from(yearCounts, ([year, count]) => ({
    year,
    count,
  })).sort((a, b) => a.year - b.year);

  return {
    totalTracks: tracks.length,
    totalMs,
    uniqueArtists: uniqueArtists.size,
    uniqueAlbums: uniqueAlbums.size,
    explicit,
    topArtists,
    topAlbums,
    byYear,
  };
}

function computeGenreCounts(
  tracks: RawTrack[],
  genreMap: Record<string, string[]> | null,
): { name: string; value: number }[] | null {
  if (!genreMap) return null;
  const counts = new Map<string, number>();
  for (const t of tracks) {
    const trackGenres = new Set<string>();
    for (const a of t.artists) {
      for (const g of genreMap[a.id] ?? []) trackGenres.add(g);
    }
    for (const g of trackGenres) {
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
  }
  return Array.from(counts, ([name, value]) => ({ name, value })).sort(
    (a, b) => b.value - a.value,
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function toRawTrack(c: CachedTrack): RawTrack {
  return {
    uri: c.uri,
    name: c.name,
    duration_ms: c.duration_ms,
    explicit: c.explicit,
    added_at: c.added_at,
    artists: c.artists,
    album: {
      id: c.album.id,
      name: c.album.name,
      images: c.album.image ? [{ url: c.album.image }] : [],
    },
  };
}

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "ahora mismo";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return new Date(ms).toLocaleDateString("es");
}
