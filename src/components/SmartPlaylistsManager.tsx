"use client";

import { useState, useTransition } from "react";
import {
  createSmartPlaylist,
  deleteSmartPlaylist,
  listSmartPlaylists,
  materializeSmartPlaylist,
  updateSmartPlaylist,
  type SmartPlaylist,
} from "@/lib/smart-actions";
import type { SmartRules } from "@/lib/smart-rules";
import type { Tag } from "@/lib/tags";
import TagBadge from "./TagBadge";

export default function SmartPlaylistsManager({
  initial,
  tags,
}: {
  initial: SmartPlaylist[];
  tags: Tag[];
}) {
  const [items, setItems] = useState<SmartPlaylist[]>(initial);
  const [editing, setEditing] = useState<SmartPlaylist | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = async () => {
    const updated = await listSmartPlaylists();
    setItems(updated);
  };

  const handleMaterialize = (sp: SmartPlaylist) => {
    setError(null);
    setToast(null);
    startTransition(async () => {
      try {
        const result = await materializeSmartPlaylist(sp.id);
        setToast(
          `Materializada con ${result.count} canciones — actualizada en Spotify.`,
        );
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo materializar");
      }
    });
  };

  const handleDelete = (sp: SmartPlaylist) => {
    if (
      !confirm(
        `Eliminar smart playlist "${sp.name}"? La playlist real en Spotify NO se borra; solo se desconecta.`,
      )
    )
      return;
    startTransition(async () => {
      try {
        await deleteSmartPlaylist(sp.id);
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
          Catálogo <span className="text-mute">/ {items.length}</span>
        </h2>
        <button
          onClick={() => {
            setCreating(true);
            setEditing(null);
          }}
          className="group inline-flex items-center gap-2 bg-acid text-ink px-4 py-2 hover:bg-cream transition-colors"
        >
          <span className="label-mono">Nueva regla</span>
          <span className="font-mono text-sm group-hover:rotate-90 transition-transform duration-300">
            +
          </span>
        </button>
      </div>

      {toast && (
        <p className="label-mono text-acid ring-1 ring-acid/40 bg-acid/10 px-3 py-2 mb-4">
          {toast}
        </p>
      )}
      {error && (
        <p className="label-mono text-blood ring-1 ring-blood/40 bg-blood/10 px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {(creating || editing) && (
        <Editor
          initial={editing}
          tags={tags}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            await refresh();
          }}
        />
      )}

      {items.length === 0 && !creating && !editing && (
        <div className="py-20 text-center max-w-xl mx-auto">
          <p className="display-italic text-3xl text-cream-dim mb-3">
            Aún sin reglas.
          </p>
          <p className="font-serif italic text-mute">
            Crea tu primera smart playlist arriba. Define filtros y luego
            materialízala — una playlist real se sincroniza en tu cuenta.
          </p>
        </div>
      )}

      <ul className="space-y-3 mt-6">
        {items.map((sp) => (
          <li
            key={sp.id}
            className="ring-1 ring-rule p-5 hover:ring-cream-dim transition-colors"
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <h3 className="display-italic text-2xl mb-1 [text-wrap:balance]">
                  {sp.name}
                </h3>
                {sp.description && (
                  <p className="font-serif italic text-cream-dim text-sm mb-2">
                    {sp.description}
                  </p>
                )}
                <RulesPreview rules={sp.rules} tags={tags} />
                <p className="font-mono text-[10px] text-mute mt-3">
                  {sp.lastSyncedAt
                    ? `Última materialización: ${formatRelative(sp.lastSyncedAt)} · ${sp.lastSyncCount ?? 0} canciones`
                    : "Sin materializar todavía"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleMaterialize(sp)}
                  disabled={pending}
                  className="group inline-flex items-center gap-2 bg-acid text-ink px-3 py-1.5 hover:bg-cream transition-colors disabled:opacity-40"
                  title="Sincronizar con Spotify ahora"
                >
                  <span className="label-mono">
                    {sp.spotifyPlaylistId ? "Sincronizar" : "Materializar"}
                  </span>
                  <span className="font-mono text-sm group-hover:rotate-180 transition-transform duration-500">
                    ↻
                  </span>
                </button>
                <button
                  onClick={() => {
                    setEditing(sp);
                    setCreating(false);
                  }}
                  className="label-mono text-mute hover:text-cream transition-colors px-2"
                  title="Editar"
                >
                  ✎
                </button>
                <button
                  onClick={() => handleDelete(sp)}
                  className="label-mono text-mute hover:text-blood transition-colors px-2"
                  title="Eliminar"
                >
                  ×
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------- */

function RulesPreview({
  rules,
  tags,
}: {
  rules: SmartRules;
  tags: Tag[];
}) {
  const tagName = (id: number) => tags.find((t) => t.id === id)?.name ?? `#${id}`;
  const parts: string[] = [];
  if (rules.includeTagIds?.length)
    parts.push(`tag ∈ {${rules.includeTagIds.map(tagName).join(", ")}}`);
  if (rules.excludeTagIds?.length)
    parts.push(`tag ∉ {${rules.excludeTagIds.map(tagName).join(", ")}}`);
  if (rules.includeGenres?.length)
    parts.push(`género ∈ {${rules.includeGenres.join(", ")}}`);
  if (rules.excludeGenres?.length)
    parts.push(`género ∉ {${rules.excludeGenres.join(", ")}}`);
  if (rules.addedAfter) parts.push(`añadida ≥ ${rules.addedAfter}`);
  if (rules.addedBefore) parts.push(`añadida < ${rules.addedBefore}`);
  if (rules.limit) parts.push(`max ${rules.limit}`);
  if (rules.sortBy && rules.sortBy !== "added_desc")
    parts.push(`orden: ${rules.sortBy}`);

  return (
    <p className="font-mono text-[11px] text-mute leading-relaxed">
      {parts.length === 0 ? (
        <span className="italic">sin filtros · todas las Liked Songs</span>
      ) : (
        parts.join("  ·  ")
      )}
    </p>
  );
}

/* ---------------------------------------------------------------- */

function Editor({
  initial,
  tags,
  onCancel,
  onSaved,
}: {
  initial: SmartPlaylist | null;
  tags: Tag[];
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [includeTagIds, setIncludeTagIds] = useState<Set<number>>(
    new Set(initial?.rules.includeTagIds ?? []),
  );
  const [excludeTagIds, setExcludeTagIds] = useState<Set<number>>(
    new Set(initial?.rules.excludeTagIds ?? []),
  );
  const [includeGenres, setIncludeGenres] = useState(
    (initial?.rules.includeGenres ?? []).join(", "),
  );
  const [excludeGenres, setExcludeGenres] = useState(
    (initial?.rules.excludeGenres ?? []).join(", "),
  );
  const [addedAfter, setAddedAfter] = useState(initial?.rules.addedAfter ?? "");
  const [addedBefore, setAddedBefore] = useState(
    initial?.rules.addedBefore ?? "",
  );
  const [limit, setLimit] = useState(initial?.rules.limit?.toString() ?? "");
  const [sortBy, setSortBy] = useState<SmartRules["sortBy"]>(
    initial?.rules.sortBy ?? "added_desc",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggleSet = (
    set: Set<number>,
    setter: (s: Set<number>) => void,
    id: number,
  ) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  const submit = () => {
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setError(null);
    const rules: SmartRules = {
      includeTagIds: Array.from(includeTagIds),
      excludeTagIds: Array.from(excludeTagIds),
      includeGenres: parseList(includeGenres),
      excludeGenres: parseList(excludeGenres),
      addedAfter: addedAfter || undefined,
      addedBefore: addedBefore || undefined,
      limit: limit ? Math.max(1, parseInt(limit, 10) || 0) : undefined,
      sortBy,
    };
    startTransition(async () => {
      try {
        if (initial) {
          await updateSmartPlaylist(initial.id, {
            name,
            description: description || null,
            rules,
          });
        } else {
          await createSmartPlaylist({ name, description, rules });
        }
        await onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar");
      }
    });
  };

  return (
    <div className="ring-1 ring-acid bg-acid/[0.04] p-6 mb-8">
      <p className="label-mono text-acid mb-2">
        {initial ? "Editar regla" : "Nueva regla"}
      </p>
      <h3 className="display-italic text-3xl mb-6">
        {initial ? `Editar ${initial.name}` : "Define tus filtros"}
      </h3>

      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <Field label="Nombre" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="ej. estudio nocturno"
            className="w-full bg-transparent ring-1 ring-rule px-3 py-2 font-serif text-base text-cream placeholder:text-mute placeholder:italic focus:outline-none focus:ring-acid"
          />
        </Field>
        <Field label="Descripción">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            placeholder="opcional"
            className="w-full bg-transparent ring-1 ring-rule px-3 py-2 font-mono text-sm text-cream placeholder:text-mute focus:outline-none focus:ring-acid"
          />
        </Field>
      </div>

      <Field label={`Incluir si tiene alguno de estos tags`}>
        {tags.length === 0 ? (
          <p className="font-mono text-[11px] text-mute italic">
            Sin tags todavía. Crea tags primero en /tags.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5 mt-1">
            {tags.map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  onClick={() =>
                    toggleSet(includeTagIds, setIncludeTagIds, tag.id)
                  }
                >
                  <TagBadge
                    tag={tag}
                    size="md"
                    active={includeTagIds.has(tag.id)}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Field>

      {tags.length > 0 && (
        <Field label="Excluir si tiene alguno de estos tags">
          <ul className="flex flex-wrap gap-1.5 mt-1">
            {tags.map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  onClick={() =>
                    toggleSet(excludeTagIds, setExcludeTagIds, tag.id)
                  }
                  className={
                    excludeTagIds.has(tag.id) ? "ring-2 ring-blood/50" : ""
                  }
                >
                  <TagBadge
                    tag={tag}
                    size="md"
                    active={excludeTagIds.has(tag.id)}
                  />
                </button>
              </li>
            ))}
          </ul>
        </Field>
      )}

      <div className="grid sm:grid-cols-2 gap-4 mt-5">
        <Field
          label="Incluir géneros (separados por coma)"
          hint="ej. shoegaze, indie pop"
        >
          <input
            value={includeGenres}
            onChange={(e) => setIncludeGenres(e.target.value)}
            className="w-full bg-transparent ring-1 ring-rule px-3 py-2 font-mono text-sm text-cream focus:outline-none focus:ring-acid"
          />
        </Field>
        <Field label="Excluir géneros" hint="ej. country, christmas">
          <input
            value={excludeGenres}
            onChange={(e) => setExcludeGenres(e.target.value)}
            className="w-full bg-transparent ring-1 ring-rule px-3 py-2 font-mono text-sm text-cream focus:outline-none focus:ring-acid"
          />
        </Field>
        <Field label="Añadidas desde" hint="YYYY-MM-DD">
          <input
            value={addedAfter}
            onChange={(e) => setAddedAfter(e.target.value)}
            placeholder="2024-01-01"
            className="w-full bg-transparent ring-1 ring-rule px-3 py-2 font-mono text-sm text-cream placeholder:text-mute focus:outline-none focus:ring-acid"
          />
        </Field>
        <Field label="Hasta" hint="YYYY-MM-DD">
          <input
            value={addedBefore}
            onChange={(e) => setAddedBefore(e.target.value)}
            placeholder="2025-01-01"
            className="w-full bg-transparent ring-1 ring-rule px-3 py-2 font-mono text-sm text-cream placeholder:text-mute focus:outline-none focus:ring-acid"
          />
        </Field>
        <Field label="Límite de canciones">
          <input
            value={limit}
            onChange={(e) => setLimit(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="ej. 100"
            className="w-full bg-transparent ring-1 ring-rule px-3 py-2 font-mono text-sm text-cream placeholder:text-mute focus:outline-none focus:ring-acid"
          />
        </Field>
        <Field label="Ordenar por">
          <select
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as SmartRules["sortBy"])
            }
            className="w-full bg-ink-2 ring-1 ring-rule px-3 py-2 font-mono text-sm text-cream focus:outline-none focus:ring-acid"
          >
            <option value="added_desc">Más recientes primero</option>
            <option value="added_asc">Más antiguas primero</option>
            <option value="random">Aleatorio</option>
          </select>
        </Field>
      </div>

      {error && (
        <p className="label-mono text-blood ring-1 ring-blood/40 bg-blood/10 px-3 py-2 mt-4">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between mt-6">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="label-mono text-mute hover:text-cream transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !name.trim()}
          className="group inline-flex items-center gap-3 bg-acid text-ink px-5 py-2.5 hover:bg-cream transition-colors disabled:opacity-40"
        >
          <span className="label-mono">
            {pending ? "Guardando…" : initial ? "Guardar cambios" : "Crear regla"}
          </span>
          <span className="font-mono text-sm group-hover:translate-x-1 transition-transform">
            →
          </span>
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="label-mono text-cream">
          {label}
          {required && <span className="text-acid"> *</span>}
        </label>
        {hint && <span className="label-mono text-mute">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function parseList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length > 0);
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "ahora mismo";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}
