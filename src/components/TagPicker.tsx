"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  applyTagToTracks,
  createTag,
  deleteTag,
  listTags,
  removeTagFromTracks,
} from "@/lib/tag-actions";
import { TAG_COLORS, type Tag } from "@/lib/tags";
import TagBadge, { tagColorVar } from "./TagBadge";

type Props = {
  /** URIs the action will affect. */
  uris: string[];
  /** Existing tags-per-track map (used to compute "applied to all" state). */
  currentTagsByUri: Record<string, Tag[]>;
  /** Called whenever tags change so parent can refresh state. */
  onChanged: () => void;
  onClose: () => void;
};

export default function TagPicker({
  uris,
  currentTagsByUri,
  onChanged,
  onClose,
}: Props) {
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // For new tag creation
  const [newColor, setNewColor] = useState<string>("acid");

  useEffect(() => {
    listTags()
      .then(setTags)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "No se pudo cargar"),
      )
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tags ?? [];
    return (tags ?? []).filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, search]);

  const exactMatch = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (tags ?? []).find((t) => t.name.toLowerCase() === q);
  }, [tags, search]);

  // For each tag, how many of the selected URIs already have it
  const appliedCount = useMemo(() => {
    const map = new Map<number, number>();
    for (const uri of uris) {
      for (const t of currentTagsByUri[uri] ?? []) {
        map.set(t.id, (map.get(t.id) ?? 0) + 1);
      }
    }
    return map;
  }, [uris, currentTagsByUri]);

  const tagState = (tagId: number): "all" | "some" | "none" => {
    const c = appliedCount.get(tagId) ?? 0;
    if (c === 0) return "none";
    if (c === uris.length) return "all";
    return "some";
  };

  const refresh = async () => {
    const updated = await listTags();
    setTags(updated);
    onChanged();
  };

  const handleToggle = (tag: Tag) => {
    setError(null);
    const state = tagState(tag.id);
    startTransition(async () => {
      try {
        if (state === "all") {
          await removeTagFromTracks(tag.id, uris);
        } else {
          await applyTagToTracks(tag.id, uris);
        }
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al aplicar");
      }
    });
  };

  const handleCreate = () => {
    const name = search.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      try {
        const tag = await createTag(name, newColor);
        // Apply to selection immediately
        if (uris.length > 0) {
          await applyTagToTracks(tag.id, uris);
        }
        setSearch("");
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo crear");
      }
    });
  };

  const handleDelete = (tag: Tag) => {
    if (
      !confirm(
        `Eliminar el tag "${tag.name}"? Se quitará de ${tag.trackCount} canci${tag.trackCount === 1 ? "ón" : "ones"}.`,
      )
    )
      return;
    startTransition(async () => {
      try {
        await deleteTag(tag.id);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo eliminar");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-md flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-ink-2 ring-1 ring-rule w-full max-w-xl flex flex-col max-h-[80vh] rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 hairline-b">
          <p className="label-mono text-acid mb-2">
            Tags · {uris.length} canci{uris.length === 1 ? "ón" : "ones"}
          </p>
          <h3 className="display-italic text-3xl mb-4">Aplicar tags</h3>
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="buscar o crear tag…"
            className="w-full bg-transparent ring-1 ring-rule px-3 py-2 font-mono text-sm text-cream placeholder:text-mute focus:outline-none focus:ring-acid"
          />

          {/* Color picker for new tag, shown when search has content and no exact match */}
          {search.trim() && !exactMatch && (
            <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="label-mono text-mute">color:</span>
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={`w-5 h-5 ring-1 transition-all ${
                      newColor === c
                        ? "ring-cream scale-110"
                        : "ring-rule hover:ring-cream-dim"
                    }`}
                    style={{ backgroundColor: tagColorVar(c) }}
                    aria-label={c}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={handleCreate}
                disabled={pending}
                className="group inline-flex items-center gap-2 bg-acid text-ink px-3 py-1.5 hover:bg-cream transition-colors disabled:opacity-40"
              >
                <span className="label-mono">Crear "{search.trim()}"</span>
                <span className="font-mono text-sm">+</span>
              </button>
            </div>
          )}
        </div>

        <ul className="flex-1 overflow-y-auto">
          {loading && (
            <li className="px-6 py-10 text-center font-serif italic text-mute">
              Cargando…
            </li>
          )}
          {!loading && filtered.length === 0 && !search.trim() && (
            <li className="px-6 py-10 text-center font-serif italic text-mute">
              Aún no tienes tags. Escribe arriba para crear el primero.
            </li>
          )}
          {!loading && filtered.length === 0 && search.trim() && !exactMatch && (
            <li className="px-6 py-6 text-center font-serif italic text-mute text-sm">
              Ningún tag con ese nombre. Pulsa "Crear" arriba.
            </li>
          )}
          {filtered.map((tag) => {
            const state = tagState(tag.id);
            return (
              <li
                key={tag.id}
                className="px-6 py-3 hairline-b flex items-center gap-3 hover:bg-ink-3 group"
              >
                <button
                  type="button"
                  onClick={() => handleToggle(tag)}
                  disabled={pending}
                  className="flex-1 flex items-center gap-3 text-left disabled:opacity-50"
                >
                  <span
                    className={`w-4 h-4 ring-1 flex items-center justify-center transition-colors`}
                    style={{
                      backgroundColor:
                        state === "all"
                          ? tagColorVar(tag.color)
                          : "transparent",
                      borderColor: tagColorVar(tag.color),
                    }}
                  >
                    {state === "all" && (
                      <span className="text-ink text-[10px] leading-none font-bold">
                        ✓
                      </span>
                    )}
                    {state === "some" && (
                      <span
                        className="block w-2 h-px"
                        style={{ backgroundColor: tagColorVar(tag.color) }}
                      />
                    )}
                  </span>
                  <TagBadge tag={tag} size="md" />
                  <span className="font-mono text-[10px] text-mute ml-auto num-tabular">
                    {tag.trackCount} en biblioteca
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(tag)}
                  disabled={pending}
                  className="opacity-0 group-hover:opacity-100 label-mono text-blood hover:text-cream transition-all px-2"
                  title="Eliminar tag"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>

        {error && (
          <p className="mx-6 mb-4 label-mono text-blood ring-1 ring-blood/40 bg-blood/10 px-3 py-2">
            {error}
          </p>
        )}

        <div className="px-6 py-4 hairline-b border-t flex items-center justify-between">
          <span className="label-mono text-mute">
            click un tag para aplicar/quitar
          </span>
          <button
            onClick={onClose}
            className="label-mono text-cream hover:text-acid transition-colors"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
