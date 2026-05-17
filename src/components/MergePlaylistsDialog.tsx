"use client";

import { useMemo, useState, useTransition } from "react";
import { mergePlaylists } from "@/lib/spotify-actions";
import type { SpotifyPlaylist } from "@/lib/spotify";

export default function MergePlaylistsButton({
  playlists,
}: {
  playlists: SpotifyPlaylist[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-2 ring-1 ring-rule px-4 py-2 hover:ring-cream transition-colors"
      >
        <span className="label-mono text-cream">Fusionar</span>
        <span className="font-mono text-sm text-mute group-hover:text-cream transition-colors">
          ⇉
        </span>
      </button>

      {open && (
        <Dialog playlists={playlists} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/* ---------------------------------------------------------------- */

function Dialog({
  playlists,
  onClose,
}: {
  playlists: SpotifyPlaylist[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dedupe, setDedupe] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return playlists;
    return playlists.filter((p) => p.name.toLowerCase().includes(q));
  }, [playlists, search]);

  const totalTracks = useMemo(() => {
    let n = 0;
    for (const p of playlists) {
      if (selected.has(p.id)) n += p.items?.total ?? 0;
    }
    return n;
  }, [selected, playlists]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = () => {
    if (selected.size < 2) {
      setError("Selecciona al menos 2 playlists.");
      return;
    }
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await mergePlaylists(
          Array.from(selected),
          {
            name,
            description,
            public: false,
            collaborative: false,
            redirectAfter: true,
          },
          { dedupe },
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo fusionar");
      }
    });
  };

  // Auto-suggest name when 2+ selected
  useMemo(() => {
    if (selected.size >= 2 && !name) {
      const names = playlists
        .filter((p) => selected.has(p.id))
        .map((p) => p.name)
        .slice(0, 3);
      setName(names.join(" + "));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-md flex items-center justify-center p-6"
      onClick={onClose}
    >
      <form
        className="bg-ink-2 ring-1 ring-rule w-full max-w-2xl flex flex-col max-h-[90vh] rise"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="px-7 py-6 hairline-b">
          <p className="label-mono text-acid mb-2">
            Operación · {selected.size} fuente{selected.size === 1 ? "" : "s"}
            {totalTracks > 0 && (
              <span className="text-cream-dim">
                {" · "}
                {totalTracks.toLocaleString("es")} canciones
                {dedupe && " (antes de dedupe)"}
              </span>
            )}
          </p>
          <h3 className="display-italic text-3xl mb-3">Fusionar playlists</h3>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="buscar playlist…"
            className="w-full bg-transparent ring-1 ring-rule px-3 py-2 font-mono text-sm text-cream placeholder:text-mute focus:outline-none focus:ring-acid"
          />
        </div>

        <ul className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="px-6 py-10 text-center font-serif italic text-mute">
              Sin coincidencias.
            </li>
          ) : (
            filtered.map((p) => {
              const isSel = selected.has(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    className={`w-full px-6 py-2.5 hairline-b flex items-center gap-4 text-left transition-colors group ${
                      isSel ? "bg-acid/[0.06]" : "hover:bg-ink-3"
                    }`}
                  >
                    <span
                      className={`w-4 h-4 ring-1 transition-all flex items-center justify-center shrink-0 ${
                        isSel ? "bg-acid ring-acid" : "ring-rule"
                      }`}
                    >
                      {isSel && (
                        <span className="text-ink text-[10px] leading-none font-bold">
                          ✓
                        </span>
                      )}
                    </span>
                    <div className="w-9 h-9 bg-ink-3 ring-1 ring-rule overflow-hidden shrink-0">
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
                      <p className="font-serif text-sm text-cream truncate">
                        {p.name}
                      </p>
                      <p className="font-mono text-[10px] text-mute mt-0.5">
                        {(p.items?.total ?? 0).toLocaleString("es")} canciones
                      </p>
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="px-7 py-5 hairline-b border-t space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label-mono text-cream block mb-1.5">
                Nombre <span className="text-acid">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="ej. mejor de 2024"
                className="w-full bg-transparent ring-1 ring-rule px-3 py-2 font-serif text-base text-cream placeholder:text-mute placeholder:italic focus:outline-none focus:ring-acid"
              />
            </div>
            <div>
              <label className="label-mono text-cream block mb-1.5">
                Descripción
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
                placeholder="opcional"
                className="w-full bg-transparent ring-1 ring-rule px-3 py-2 font-mono text-sm text-cream placeholder:text-mute focus:outline-none focus:ring-acid"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dedupe}
              onChange={(e) => setDedupe(e.target.checked)}
              className="appearance-none w-4 h-4 ring-1 ring-rule checked:bg-acid checked:ring-acid relative"
            />
            <span className="label-mono text-cream">
              Quitar duplicados al fusionar
            </span>
          </label>

          {error && (
            <p className="label-mono text-blood ring-1 ring-blood/40 bg-blood/10 px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="px-7 py-5 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="label-mono text-mute hover:text-cream transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending || selected.size < 2 || !name.trim()}
            className="group inline-flex items-center gap-3 bg-acid text-ink px-5 py-2.5 hover:bg-cream transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="label-mono">
              {pending
                ? "Fusionando…"
                : `Fusionar ${selected.size} → 1`}
            </span>
            <span className="font-mono text-sm group-hover:translate-x-1 transition-transform">
              →
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
