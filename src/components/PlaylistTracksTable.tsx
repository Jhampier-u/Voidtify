"use client";

import { useMemo, useState, useTransition } from "react";
import {
  cleanupDuplicates,
  copyTracksToPlaylist,
  fetchTracksPage,
  moveTracksToPlaylist,
  removeTracksFromPlaylist,
  reorderTrack,
} from "@/lib/spotify-actions";
import { getArtistGenres } from "@/lib/genre-actions";
import { getTagsForTracks } from "@/lib/tag-actions";
import type { Tag } from "@/lib/tags";
import type { PlaylistTrackItem, SpotifyPlaylist } from "@/lib/spotify";
import CreatePlaylistButton from "./CreatePlaylistDialog";
import TagPicker from "./TagPicker";
import TagBadge from "./TagBadge";

type Props = {
  playlistId: string;
  playlistName: string;
  ownedByMe: boolean;
  initialTracks: PlaylistTrackItem[];
  totalTracks: number;
  myPlaylists: SpotifyPlaylist[];
  initialTagsByUri: Record<string, Tag[]>;
};

const trackOf = (i: PlaylistTrackItem) => i.item ?? i.track;

export default function PlaylistTracksTable({
  playlistId,
  playlistName,
  ownedByMe,
  initialTracks,
  totalTracks,
  myPlaylists,
  initialTagsByUri,
}: Props) {
  const [tracks, setTracks] = useState<PlaylistTrackItem[]>(initialTracks);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<"copy" | "move" | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [showOnlyDups, setShowOnlyDups] = useState(false);

  // Drag-and-drop reorder state
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Tag state
  const [tagsByUri, setTagsByUri] = useState<Record<string, Tag[]>>(
    initialTagsByUri,
  );
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());

  // Genre filtering state
  const [genreData, setGenreData] = useState<Record<string, string[]> | null>(
    null,
  );
  const [analyzingGenres, setAnalyzingGenres] = useState(false);
  const [genreProgress, setGenreProgress] = useState({ done: 0, total: 0 });
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());
  const [genreSearch, setGenreSearch] = useState("");

  const remaining = Math.max(0, totalTracks - tracks.length);
  const fullyLoaded = remaining === 0;

  // Duplicate analysis from currently loaded tracks.
  const dupAnalysis = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of tracks) {
      const uri = trackOf(it)?.uri;
      if (uri) counts.set(uri, (counts.get(uri) ?? 0) + 1);
    }
    const dupUris = new Set<string>();
    let extras = 0;
    for (const [uri, n] of counts) {
      if (n >= 2) {
        dupUris.add(uri);
        extras += n - 1;
      }
    }
    return { dupUris, dupGroups: dupUris.size, extras, counts };
  }, [tracks]);

  const loadMore = async (loadAll = false) => {
    if (loadAll) setLoadingAll(true);
    else setLoadingMore(true);
    try {
      let offset = tracks.length;
      let first = true;
      const newUris: string[] = [];
      while (offset < totalTracks) {
        // Polite throttle: gap between sequential pages so we never come
        // close to Spotify's rolling rate limit.
        if (!first) await new Promise((r) => setTimeout(r, 150));
        first = false;
        const page = await fetchTracksPage(playlistId, offset);
        setTracks((prev) => [...prev, ...page.items]);
        for (const it of page.items) {
          const uri = trackOf(it)?.uri;
          if (uri) newUris.push(uri);
        }
        offset += page.items.length || 100;
        if (!loadAll) break;
        if (!page.next) break;
      }
      // Pull any tags for newly-loaded tracks.
      if (newUris.length > 0) {
        try {
          const more = await getTagsForTracks(newUris);
          setTagsByUri((prev) => ({ ...prev, ...more }));
        } catch {}
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar más");
    } finally {
      setLoadingMore(false);
      setLoadingAll(false);
    }
  };

  /** Re-fetch tags for all currently loaded tracks (after picker changes). */
  const refreshTags = async () => {
    const uris = tracks
      .map((it) => trackOf(it)?.uri)
      .filter((u): u is string => Boolean(u));
    try {
      const data = await getTagsForTracks(uris);
      setTagsByUri(data);
    } catch (e) {
      console.warn("[refreshTags] failed:", e);
    }
  };

  // Reorder via drag-and-drop. Only enabled when no filters are active and
  // the user owns the playlist (so positions are meaningful and writable).
  const filtersActive =
    selectedGenres.size > 0 || selectedTagIds.size > 0 || showOnlyDups;
  const reorderEnabled = ownedByMe && !filtersActive;

  const handleDrop = async (fromIndex: number, toIndex: number) => {
    setDraggingIndex(null);
    setHoverIndex(null);
    if (fromIndex === toIndex || fromIndex + 1 === toIndex) return;

    // Optimistic local update
    const prev = tracks;
    const moved = [...tracks];
    const [item] = moved.splice(fromIndex, 1);
    const adjusted = toIndex > fromIndex ? toIndex - 1 : toIndex;
    moved.splice(adjusted, 0, item);
    setTracks(moved);

    try {
      await reorderTrack(playlistId, fromIndex, toIndex);
    } catch (e) {
      console.error("[reorder] failed, rolling back", e);
      setTracks(prev);
      setError(e instanceof Error ? e.message : "No se pudo reordenar");
    }
  };

  const toggleTagFilter = (id: number) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // All tags currently applied to loaded tracks, with counts.
  const tagFilterChips = useMemo(() => {
    const counts = new Map<number, { tag: Tag; count: number }>();
    for (const it of tracks) {
      const uri = trackOf(it)?.uri;
      if (!uri) continue;
      for (const t of tagsByUri[uri] ?? []) {
        const existing = counts.get(t.id);
        if (existing) existing.count++;
        else counts.set(t.id, { tag: t, count: 1 });
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [tracks, tagsByUri]);

  const toggle = (uri: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  };

  const allUris = useMemo(
    () =>
      tracks
        .map((i) => trackOf(i)?.uri)
        .filter((u): u is string => Boolean(u)),
    [tracks],
  );
  const allSelected =
    selected.size > 0 && selected.size === allUris.length;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allUris));
  };

  const clearSelection = () => setSelected(new Set());

  const handleRemove = () => {
    if (!ownedByMe) return;
    const uris = Array.from(selected);
    if (
      !confirm(
        `Quitar ${uris.length} ${uris.length === 1 ? "canción" : "canciones"} de esta playlist?`,
      )
    )
      return;
    startTransition(async () => {
      try {
        await removeTracksFromPlaylist(playlistId, uris);
        clearSelection();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al quitar");
      }
    });
  };

  // Unique artists across loaded tracks, sorted by frequency (most common
  // first). Processing in this order means the dominant genres of the
  // playlist appear in the chips within the first few seconds of analysis.
  const artistInputs = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; count: number }
    >();
    for (const it of tracks) {
      const t = trackOf(it);
      if (!t) continue;
      for (const a of t.artists) {
        if (!a.id) continue;
        const existing = map.get(a.id);
        if (existing) existing.count++;
        else map.set(a.id, { id: a.id, name: a.name, count: 1 });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .map(({ id, name }) => ({ id, name }));
  }, [tracks]);
  const artistIds = artistInputs.map((a) => a.id);

  // Genre count map (only available after analysis)
  const genreCounts = useMemo(() => {
    if (!genreData) return null;
    const counts = new Map<string, number>();
    for (const it of tracks) {
      const t = trackOf(it);
      if (!t) continue;
      const trackGenres = new Set<string>();
      for (const a of t.artists) {
        for (const g of genreData[a.id] ?? []) trackGenres.add(g);
      }
      for (const g of trackGenres) {
        counts.set(g, (counts.get(g) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [genreData, tracks]);

  const filteredGenreCounts = useMemo(() => {
    if (!genreCounts) return null;
    const q = genreSearch.trim().toLowerCase();
    if (!q) return genreCounts;
    return genreCounts.filter(([g]) => g.toLowerCase().includes(q));
  }, [genreCounts, genreSearch]);

  const analyzeGenres = async () => {
    if (artistInputs.length === 0) return;
    setAnalyzingGenres(true);
    setGenreProgress({ done: 0, total: artistInputs.length });
    try {
      const accumulated: Record<string, string[]> = {};
      // Smaller chunks → first chips appear sooner; trade slightly more
      // server-action overhead for better perceived speed.
      const CHUNK = 30;
      for (let i = 0; i < artistInputs.length; i += CHUNK) {
        const batch = artistInputs.slice(i, i + CHUNK);
        const result = await getArtistGenres(batch);
        Object.assign(accumulated, result);
        setGenreProgress({
          done: Math.min(i + CHUNK, artistInputs.length),
          total: artistInputs.length,
        });
        setGenreData({ ...accumulated });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al analizar géneros");
    } finally {
      setAnalyzingGenres(false);
    }
  };

  const toggleGenre = (g: string) => {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  };

  const clearGenres = () => setSelectedGenres(new Set());

  const handleCleanup = () => {
    if (!ownedByMe) return;
    if (!fullyLoaded) {
      setError("Carga toda la playlist antes de limpiar duplicados.");
      return;
    }
    const dupUris = Array.from(dupAnalysis.dupUris);
    if (dupUris.length === 0) return;
    const ok = confirm(
      `Esto quitará todas las copias de ${dupAnalysis.dupGroups} canciones duplicadas y dejará una sola de cada. Las que se conserven irán al final de la playlist.\n\n¿Continuar?`,
    );
    if (!ok) return;
    startTransition(async () => {
      try {
        await cleanupDuplicates(playlistId, dupUris);
        clearSelection();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al limpiar");
      }
    });
  };

  const handlePick = (targetId: string) => {
    const uris = Array.from(selected);
    const action = picker;
    setPicker(null);
    startTransition(async () => {
      try {
        if (action === "copy") {
          await copyTracksToPlaylist(targetId, uris);
        } else if (action === "move") {
          if (!ownedByMe) return;
          await moveTracksToPlaylist(playlistId, targetId, uris);
        }
        clearSelection();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error en operación");
      }
    });
  };

  // Visible tracks: apply duplicate and genre filters, preserve original index.
  const visibleEntries = tracks
    .map((item, i) => ({ item, index: i + 1 }))
    .filter(({ item }) => {
      const t = trackOf(item);
      if (!t) return false;

      if (showOnlyDups) {
        const uri = t.uri;
        if (!uri || !dupAnalysis.dupUris.has(uri)) return false;
      }

      if (selectedGenres.size > 0 && genreData) {
        const trackGenres = new Set<string>();
        for (const a of t.artists) {
          for (const g of genreData[a.id] ?? []) trackGenres.add(g);
        }
        let any = false;
        for (const g of selectedGenres) {
          if (trackGenres.has(g)) {
            any = true;
            break;
          }
        }
        if (!any) return false;
      }

      if (selectedTagIds.size > 0) {
        const ids = new Set(
          (tagsByUri[t.uri] ?? []).map((tag) => tag.id),
        );
        let any = false;
        for (const id of selectedTagIds) {
          if (ids.has(id)) {
            any = true;
            break;
          }
        }
        if (!any) return false;
      }

      return true;
    });

  // URIs of currently visible (filtered) tracks — used for "materialize filter".
  const visibleUris = visibleEntries
    .map((e) => trackOf(e.item)?.uri)
    .filter((u): u is string => Boolean(u));

  const activeGenresList = Array.from(selectedGenres);
  const activeTagNames = tagFilterChips
    .filter(({ tag }) => selectedTagIds.has(tag.id))
    .map(({ tag }) => tag.name);
  const filterLabels = [...activeTagNames, ...activeGenresList];
  const hasActiveFilters = filterLabels.length > 0;
  const suggestedName = hasActiveFilters
    ? `${playlistName} · ${filterLabels.slice(0, 3).join(", ")}${
        filterLabels.length > 3 ? "…" : ""
      }`
    : playlistName;
  const suggestedDescription = hasActiveFilters
    ? `Filtrado de "${playlistName}" por ${filterLabels.join(", ")}.`
    : "";

  return (
    <>
      {/* Tag filter (only shown if any tags exist on loaded tracks) */}
      {tagFilterChips.length > 0 && (
        <section className="ring-1 ring-rule px-4 py-3 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <p className="label-mono text-acid">
              Tags
              {selectedTagIds.size > 0 && (
                <span className="text-cream"> · {selectedTagIds.size} activo{selectedTagIds.size === 1 ? "" : "s"}</span>
              )}
            </p>
            {selectedTagIds.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedTagIds(new Set())}
                className="label-mono text-mute hover:text-cream transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {tagFilterChips.map(({ tag, count }) => (
              <li
                key={tag.id}
                className="flex items-center gap-1.5"
              >
                <button
                  type="button"
                  onClick={() => toggleTagFilter(tag.id)}
                >
                  <TagBadge
                    tag={tag}
                    size="md"
                    active={selectedTagIds.has(tag.id)}
                  />
                </button>
                <span className="font-mono text-[10px] text-mute num-tabular -ml-1 mr-1">
                  {count}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Genre filter section */}
      <GenreFilter
        artistCount={artistIds.length}
        genreCounts={filteredGenreCounts}
        analyzing={analyzingGenres}
        progress={genreProgress}
        selected={selectedGenres}
        onAnalyze={analyzeGenres}
        onToggle={toggleGenre}
        onClear={clearGenres}
        search={genreSearch}
        onSearchChange={setGenreSearch}
      />

      {hasActiveFilters && visibleUris.length > 0 && (
        <div className="ring-1 ring-acid bg-acid/[0.06] px-4 py-3 mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="label-mono text-acid">
              Filtro activo · {visibleUris.length.toLocaleString("es")}{" "}
              canci{visibleUris.length === 1 ? "ón" : "ones"} coinciden
            </p>
            <p className="font-mono text-[11px] text-mute mt-0.5 truncate max-w-md">
              {filterLabels.join(" · ")}
            </p>
          </div>
          <CreatePlaylistButton
            label={`Crear playlist con ${visibleUris.length}`}
            initialName={suggestedName.slice(0, 100)}
            initialDescription={suggestedDescription.slice(0, 300)}
            tracks={visibleUris}
            stayOnPage
          />
        </div>
      )}

      {dupAnalysis.dupGroups > 0 && (
        <div className="ring-1 ring-acid/40 bg-acid/[0.04] px-4 py-3 mb-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="label-mono text-acid num-tabular">
              {dupAnalysis.dupGroups} canci
              {dupAnalysis.dupGroups === 1 ? "ón duplicada" : "ones duplicadas"}{" "}
              <span className="text-cream-dim">·</span>{" "}
              {dupAnalysis.extras} entrada{dupAnalysis.extras === 1 ? "" : "s"}{" "}
              redundante{dupAnalysis.extras === 1 ? "" : "s"}
            </p>
            {!fullyLoaded && (
              <p className="font-mono text-[11px] text-mute mt-1">
                Análisis sobre las primeras {tracks.length.toLocaleString("es")}{" "}
                de {totalTracks.toLocaleString("es")}. Carga todas para
                resultado completo.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowOnlyDups((v) => !v)}
              className={`label-mono px-3 py-1.5 ring-1 transition-all ${
                showOnlyDups
                  ? "bg-cream text-ink ring-cream"
                  : "ring-rule text-cream hover:ring-cream"
              }`}
            >
              {showOnlyDups ? "Ver todas" : "Ver solo duplicados"}
            </button>
            {ownedByMe && (
              <button
                type="button"
                onClick={handleCleanup}
                disabled={pending || !fullyLoaded}
                title={
                  !fullyLoaded ? "Carga todas las canciones primero" : undefined
                }
                className="label-mono px-3 py-1.5 bg-acid text-ink hover:bg-cream transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Limpiar →
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between hairline-b pb-3 mb-2">
        <button
          type="button"
          onClick={toggleAll}
          className="label-mono text-mute hover:text-acid transition-colors"
        >
          {allSelected ? "Deseleccionar todo" : "Seleccionar todo"}
          <span className="ml-2 num-tabular text-cream-dim">
            ({allUris.length})
          </span>
        </button>
        {selected.size > 0 && (
          <span className="label-mono text-acid num-tabular">
            {selected.size} seleccionadas
          </span>
        )}
      </div>

      <ul>
        {visibleEntries.map(({ item, index }) => {
          const t = trackOf(item);
          const uri = t?.uri;
          const isSel = uri ? selected.has(uri) : false;
          const dupCount = uri ? dupAnalysis.counts.get(uri) ?? 1 : 1;
          const trackTags = uri ? tagsByUri[uri] ?? [] : [];
          // Position in the original tracks array (0-based) — what Spotify wants.
          const positionZero = index - 1;
          return (
            <TrackRow
              key={`${t?.id ?? "local"}-${index}`}
              item={item}
              index={index}
              selected={isSel}
              onToggle={() => uri && toggle(uri)}
              selectable={Boolean(uri)}
              dupCount={dupCount}
              tags={trackTags}
              draggable={reorderEnabled}
              dragging={draggingIndex === positionZero}
              hoverBefore={hoverIndex === positionZero}
              hoverAfter={
                hoverIndex === positionZero + 1 &&
                positionZero === tracks.length - 1
              }
              onDragStart={() => setDraggingIndex(positionZero)}
              onDragEnd={() => {
                setDraggingIndex(null);
                setHoverIndex(null);
              }}
              onDragOverRow={(e) => {
                if (draggingIndex === null) return;
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const before = e.clientY < rect.top + rect.height / 2;
                setHoverIndex(before ? positionZero : positionZero + 1);
              }}
              onDropRow={(e) => {
                if (draggingIndex === null) return;
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const before = e.clientY < rect.top + rect.height / 2;
                const target = before ? positionZero : positionZero + 1;
                handleDrop(draggingIndex, target);
              }}
            />
          );
        })}
        {showOnlyDups && visibleEntries.length === 0 && (
          <li className="py-12 text-center font-serif italic text-mute">
            Sin duplicados en las canciones cargadas.
          </li>
        )}
      </ul>

      {remaining > 0 && (
        <div className="mt-8 flex items-center justify-between hairline-b pt-6 flex-wrap gap-3">
          <span className="label-mono text-mute num-tabular">
            {tracks.length.toLocaleString("es")} de{" "}
            {totalTracks.toLocaleString("es")} cargadas ·{" "}
            <span className="text-cream-dim">
              {remaining.toLocaleString("es")} restantes
            </span>
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => loadMore(false)}
              disabled={loadingMore || loadingAll}
              className="group inline-flex items-center gap-2 ring-1 ring-rule px-4 py-2 hover:ring-cream transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="label-mono text-cream">
                {loadingMore ? "Cargando…" : `Cargar 100 más`}
              </span>
              <span className="font-mono text-sm text-mute group-hover:text-cream transition-colors">
                ↓
              </span>
            </button>
            <button
              type="button"
              onClick={() => loadMore(true)}
              disabled={loadingMore || loadingAll}
              className="group inline-flex items-center gap-2 bg-acid text-ink px-4 py-2 hover:bg-cream transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="label-mono">
                {loadingAll ? "Cargando todo…" : `Cargar todas (${remaining})`}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Floating action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-ink-2/95 backdrop-blur-md ring-1 ring-cream/20 px-4 py-3 shadow-2xl rise">
          <span className="label-mono text-acid num-tabular pr-3 hairline-b border-r border-rule">
            {selected.size}{" "}
            <span className="text-cream-dim">
              {selected.size === 1 ? "selec." : "selec."}
            </span>
          </span>
          {ownedByMe && (
            <ActionButton onClick={handleRemove} disabled={pending}>
              Quitar
            </ActionButton>
          )}
          {ownedByMe && (
            <ActionButton
              onClick={() => setPicker("move")}
              disabled={pending}
            >
              Mover a…
            </ActionButton>
          )}
          <ActionButton
            onClick={() => setPicker("copy")}
            disabled={pending}
            highlight
          >
            Copiar a…
          </ActionButton>
          <ActionButton onClick={() => setTagPickerOpen(true)} disabled={pending}>
            Tag…
          </ActionButton>
          <button
            type="button"
            onClick={clearSelection}
            disabled={pending}
            className="label-mono text-mute hover:text-cream transition-colors px-3 py-1.5"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-6 right-6 z-50 bg-blood/90 text-cream px-4 py-3 max-w-md rise">
          <p className="label-mono mb-1">Error</p>
          <p className="font-mono text-xs">{error}</p>
          <button
            onClick={() => setError(null)}
            className="label-mono text-cream/80 hover:text-cream mt-2"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Picker dialog */}
      {picker && (
        <PlaylistPicker
          mode={picker}
          playlists={myPlaylists.filter((p) => p.id !== playlistId)}
          onPick={handlePick}
          onCancel={() => setPicker(null)}
          selectedCount={selected.size}
        />
      )}

      {/* Tag picker */}
      {tagPickerOpen && (
        <TagPicker
          uris={Array.from(selected)}
          currentTagsByUri={tagsByUri}
          onChanged={refreshTags}
          onClose={() => setTagPickerOpen(false)}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------- */

function GenreFilter({
  artistCount,
  genreCounts,
  analyzing,
  progress,
  selected,
  onAnalyze,
  onToggle,
  onClear,
  search,
  onSearchChange,
}: {
  artistCount: number;
  genreCounts: [string, number][] | null;
  analyzing: boolean;
  progress: { done: number; total: number };
  selected: Set<string>;
  onAnalyze: () => void;
  onToggle: (g: string) => void;
  onClear: () => void;
  search: string;
  onSearchChange: (s: string) => void;
}) {
  const hasResults = genreCounts !== null;
  const showCount = 36; // visible chips before "show more"
  const [expanded, setExpanded] = useState(false);
  const visibleChips = expanded
    ? genreCounts ?? []
    : (genreCounts ?? []).slice(0, showCount);
  const hasHidden = (genreCounts?.length ?? 0) > showCount && !expanded;

  return (
    <section className="ring-1 ring-rule px-4 py-4 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div>
          <p className="label-mono text-acid">
            Filtrar por género
            {selected.size > 0 && (
              <span className="text-cream"> · {selected.size} activo{selected.size === 1 ? "" : "s"}</span>
            )}
          </p>
          {!hasResults && !analyzing && (
            <p className="font-mono text-[11px] text-mute mt-1">
              {artistCount} artista{artistCount === 1 ? "" : "s"} en las
              canciones cargadas. Pulsa analizar para enriquecer.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasResults && (
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="buscar género…"
              className="bg-transparent ring-1 ring-rule px-2 py-1 font-mono text-xs text-cream placeholder:text-mute focus:outline-none focus:ring-acid w-44"
            />
          )}
          {selected.size > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="label-mono text-mute hover:text-cream transition-colors px-2 py-1"
            >
              Limpiar ({selected.size})
            </button>
          )}
          {!hasResults && (
            <button
              type="button"
              onClick={onAnalyze}
              disabled={analyzing || artistCount === 0}
              className="group inline-flex items-center gap-2 bg-acid text-ink px-3 py-1.5 hover:bg-cream transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="label-mono">
                {analyzing ? "Analizando…" : "Analizar géneros"}
              </span>
              {!analyzing && (
                <span className="font-mono text-xs group-hover:rotate-180 transition-transform duration-500">
                  ↻
                </span>
              )}
            </button>
          )}
          {hasResults && !analyzing && (
            <button
              type="button"
              onClick={onAnalyze}
              className="label-mono text-mute hover:text-cream transition-colors px-2 py-1"
              title="Volver a analizar (refresca caché)"
            >
              ↻
            </button>
          )}
        </div>
      </div>

      {analyzing && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between label-mono text-mute mb-2">
            <span className="num-tabular">
              {progress.done} / {progress.total} artistas
            </span>
            <span className="text-cream-dim normal-case tracking-normal font-mono text-[11px] italic">
              consultando Spotify…
            </span>
          </div>
          <div className="h-0.5 bg-rule overflow-hidden">
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

      {hasResults && genreCounts && genreCounts.length === 0 && (
        <p className="font-serif italic text-mute text-sm mt-2">
          Spotify no tiene géneros etiquetados para los artistas de esta
          playlist.
        </p>
      )}

      {hasResults && visibleChips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mt-2">
          {visibleChips.map(([genre, count]) => {
            const active = selected.has(genre);
            return (
              <li key={genre}>
                <button
                  type="button"
                  onClick={() => onToggle(genre)}
                  className={`label-mono inline-flex items-center gap-1.5 px-2.5 py-1 ring-1 transition-all normal-case tracking-normal ${
                    active
                      ? "bg-acid text-ink ring-acid"
                      : "ring-rule text-cream hover:ring-cream-dim"
                  }`}
                >
                  <span style={{ letterSpacing: "0.05em" }}>{genre}</span>
                  <span className="num-tabular text-[10px] opacity-70">
                    {count}
                  </span>
                </button>
              </li>
            );
          })}
          {hasHidden && (
            <li>
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="label-mono text-acid hover:text-cream px-2.5 py-1 transition-colors"
              >
                +{(genreCounts?.length ?? 0) - showCount} más
              </button>
            </li>
          )}
          {expanded && genreCounts && genreCounts.length > showCount && (
            <li>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="label-mono text-mute hover:text-cream px-2.5 py-1 transition-colors"
              >
                colapsar ↑
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- */

function ActionButton({
  children,
  onClick,
  disabled,
  highlight,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`label-mono px-3 py-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
        highlight
          ? "bg-acid text-ink hover:bg-cream"
          : "ring-1 ring-rule text-cream hover:ring-cream"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- */

function TrackRow({
  item,
  index,
  selected,
  onToggle,
  selectable,
  dupCount = 1,
  tags = [],
  draggable = false,
  dragging = false,
  hoverBefore = false,
  hoverAfter = false,
  onDragStart,
  onDragEnd,
  onDragOverRow,
  onDropRow,
}: {
  item: PlaylistTrackItem;
  index: number;
  selected: boolean;
  onToggle: () => void;
  selectable: boolean;
  dupCount?: number;
  tags?: Tag[];
  draggable?: boolean;
  dragging?: boolean;
  hoverBefore?: boolean;
  hoverAfter?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOverRow?: (e: React.DragEvent<HTMLLIElement>) => void;
  onDropRow?: (e: React.DragEvent<HTMLLIElement>) => void;
}) {
  const t = trackOf(item);
  if (!t) {
    return (
      <li className="grid grid-cols-[36px_60px_1fr] gap-3 py-3 hairline-b items-center label-mono text-mute italic">
        <span></span>
        <span className="num-tabular">{pad(index)}</span>
        <span>[canción no disponible]</span>
      </li>
    );
  }

  const art = t.album?.images?.at(-1)?.url ?? t.album?.images?.[0]?.url;
  const artists = t.artists.map((a) => a.name).join(", ");
  const added = item.added_at ? formatDate(item.added_at) : "—";

  return (
    <li
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        // Required for Firefox to start the drag.
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
        onDragStart?.();
      }}
      onDragEnd={() => onDragEnd?.()}
      onDragOver={onDragOverRow}
      onDrop={onDropRow}
      className={`group relative grid grid-cols-[36px_40px_1fr_72px] md:grid-cols-[36px_60px_56px_1fr_280px_80px_120px] gap-3 md:gap-6 py-3 hairline-b items-center transition-colors ${
        selected ? "bg-acid/[0.06]" : "hover:bg-ink-2/40"
      } ${dragging ? "opacity-30" : ""} ${
        hoverBefore ? "before:absolute before:left-0 before:right-0 before:-top-px before:h-px before:bg-acid before:content-['']" : ""
      } ${
        hoverAfter ? "after:absolute after:left-0 after:right-0 after:-bottom-px after:h-px after:bg-acid after:content-['']" : ""
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!selectable}
        aria-label={selected ? "Deseleccionar" : "Seleccionar"}
        className={`w-4 h-4 ring-1 transition-all flex items-center justify-center disabled:opacity-30 ${
          selected
            ? "bg-acid ring-acid"
            : "ring-rule group-hover:ring-cream-dim"
        }`}
      >
        {selected && (
          <span className="text-ink text-[10px] leading-none font-bold">✓</span>
        )}
      </button>
      <span className="label-mono num-tabular text-mute group-hover:text-acid transition-colors">
        {pad(index)}
      </span>
      <div className="hidden md:block w-10 h-10 bg-ink-3 ring-1 ring-rule overflow-hidden">
        {art && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={art}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        )}
      </div>
      <div className="min-w-0">
        <p className="font-serif text-base text-cream truncate flex items-center gap-2 flex-wrap">
          <span className="truncate">{t.name}</span>
          {t.explicit && (
            <span className="label-mono text-[9px] text-mute ring-1 ring-rule px-1 py-0 leading-4 shrink-0">
              E
            </span>
          )}
          {dupCount > 1 && (
            <span
              className="label-mono text-[9px] text-acid ring-1 ring-acid/50 px-1 py-0 leading-4 shrink-0"
              title={`Aparece ${dupCount} veces en esta playlist`}
            >
              ×{dupCount}
            </span>
          )}
          {tags.map((tag) => (
            <TagBadge key={tag.id} tag={tag} size="xs" />
          ))}
        </p>
        <p className="font-mono text-[11px] text-mute truncate mt-0.5">
          {artists}
        </p>
      </div>
      <p className="hidden md:block font-mono text-xs text-mute truncate">
        {t.album?.name}
      </p>
      <p className="font-mono text-xs text-mute num-tabular text-right">
        {formatShortDuration(t.duration_ms)}
      </p>
      <p className="hidden md:block font-mono text-[11px] text-mute num-tabular text-right">
        {added}
      </p>
    </li>
  );
}

/* ---------------------------------------------------------------- */

function PlaylistPicker({
  mode,
  playlists,
  onPick,
  onCancel,
  selectedCount,
}: {
  mode: "copy" | "move";
  playlists: SpotifyPlaylist[];
  onPick: (id: string) => void;
  onCancel: () => void;
  selectedCount: number;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return playlists;
    return playlists.filter((p) => p.name.toLowerCase().includes(q));
  }, [query, playlists]);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-md flex items-center justify-center p-6"
      onClick={onCancel}
    >
      <div
        className="bg-ink-2 ring-1 ring-rule w-full max-w-xl flex flex-col max-h-[80vh] rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 hairline-b">
          <p className="label-mono text-acid mb-2">
            {mode === "copy" ? "Copiar" : "Mover"} · {selectedCount}{" "}
            {selectedCount === 1 ? "canción" : "canciones"}
          </p>
          <h3 className="display-italic text-3xl mb-4">
            {mode === "copy" ? "Copiar a…" : "Mover a…"}
          </h3>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar playlist…"
            className="w-full bg-transparent ring-1 ring-rule px-3 py-2 font-mono text-sm text-cream placeholder:text-mute focus:outline-none focus:ring-acid"
          />
        </div>

        <ul className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="px-6 py-10 text-center font-serif italic text-mute">
              Sin coincidencias.
            </li>
          ) : (
            filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPick(p.id)}
                  className="w-full px-6 py-3 hairline-b flex items-center gap-4 text-left hover:bg-ink-3 transition-colors group"
                >
                  <div className="w-10 h-10 bg-ink-3 ring-1 ring-rule overflow-hidden shrink-0">
                    {p.images?.[0]?.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.images[0].url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-base text-cream group-hover:text-acid transition-colors truncate">
                      {p.name}
                    </p>
                    <p className="label-mono text-mute mt-0.5">
                      {(p.items?.total ?? 0).toLocaleString("es")} canciones
                    </p>
                  </div>
                  <span className="label-mono text-mute group-hover:text-acid transition-colors">
                    →
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="px-6 py-4 hairline-b border-t flex items-center justify-between">
          <span className="label-mono text-mute num-tabular">
            {filtered.length} de {playlists.length}
          </span>
          <button
            onClick={onCancel}
            className="label-mono text-mute hover:text-cream transition-colors"
          >
            Cancelar (esc)
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function pad(n: number) {
  return n.toString().padStart(3, "0");
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
