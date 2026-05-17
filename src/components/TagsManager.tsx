"use client";

import { useState, useTransition } from "react";
import {
  createTag,
  deleteTag,
  listTags,
  renameTag,
  setTagColor,
} from "@/lib/tag-actions";
import { TAG_COLORS, type Tag, type TagColor } from "@/lib/tags";
import TagBadge, { tagColorVar } from "./TagBadge";

export default function TagsManager({ initial }: { initial: Tag[] }) {
  const [tags, setTags] = useState<Tag[]>(initial);
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<TagColor>("acid");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const updated = await listTags();
    setTags(updated);
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await createTag(newName, newColor);
        setNewName("");
        setCreating(false);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo crear");
      }
    });
  };

  const handleRename = (id: number) => {
    if (!editName.trim()) return;
    startTransition(async () => {
      try {
        await renameTag(id, editName);
        setEditing(null);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo renombrar");
      }
    });
  };

  const handleColor = (id: number, color: TagColor) => {
    startTransition(async () => {
      try {
        await setTagColor(id, color);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo cambiar color");
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
    <section className="px-8 py-12">
      <div className="hairline-b pb-4 mb-8 flex items-center justify-between flex-wrap gap-3">
        <h2 className="label-mono text-acid">
          Catálogo <span className="text-mute">/ {tags.length}</span>
        </h2>
        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            className="group inline-flex items-center gap-2 bg-acid text-ink px-4 py-2 hover:bg-cream transition-colors"
          >
            <span className="label-mono">Nuevo tag</span>
            <span className="font-mono text-sm group-hover:rotate-90 transition-transform duration-300">
              +
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-2 ring-1 ring-acid bg-acid/[0.06] p-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={40}
              placeholder="nombre del tag"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewName("");
                }
              }}
              className="bg-transparent ring-1 ring-rule px-2 py-1 font-mono text-sm text-cream placeholder:text-mute focus:outline-none focus:ring-cream w-44"
            />
            <div className="flex items-center gap-1">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className={`w-4 h-4 ring-1 transition-all ${
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
              onClick={handleCreate}
              disabled={pending || !newName.trim()}
              className="label-mono text-acid disabled:opacity-40 px-2"
            >
              ✓
            </button>
            <button
              onClick={() => {
                setCreating(false);
                setNewName("");
              }}
              className="label-mono text-mute hover:text-cream px-2"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="label-mono text-blood ring-1 ring-blood/40 bg-blood/10 px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {tags.length === 0 ? (
        <div className="py-20 text-center max-w-xl mx-auto">
          <p className="display-italic text-3xl text-cream-dim mb-3">
            Aún sin etiquetas.
          </p>
          <p className="font-serif italic text-mute">
            Crea tu primer tag arriba o ve a una playlist y aplícalos a las
            canciones que ya escuchas.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="ring-1 ring-rule p-4 group hover:ring-cream-dim transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                {editing === tag.id ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => handleRename(tag.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(tag.id);
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="bg-transparent ring-1 ring-acid px-2 py-1 font-mono text-sm text-cream focus:outline-none flex-1"
                  />
                ) : (
                  <div className="flex items-center gap-3 min-w-0">
                    <TagBadge tag={tag} size="md" />
                    <span className="label-mono num-tabular text-mute">
                      {tag.trackCount.toLocaleString("es")}{" "}
                      {tag.trackCount === 1 ? "track" : "tracks"}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      setEditing(tag.id);
                      setEditName(tag.name);
                    }}
                    className="label-mono text-mute hover:text-cream transition-colors px-2"
                    title="Renombrar"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => handleDelete(tag)}
                    className="label-mono text-mute hover:text-blood transition-colors px-2"
                    title="Eliminar"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handleColor(tag.id, c)}
                    disabled={pending}
                    className={`w-4 h-4 ring-1 transition-all ${
                      tag.color === c
                        ? "ring-cream scale-110"
                        : "ring-rule hover:ring-cream-dim"
                    }`}
                    style={{ backgroundColor: tagColorVar(c) }}
                    aria-label={c}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
