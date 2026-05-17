"use client";

import { useState, useTransition } from "react";
import {
  createPlaylist,
  createPlaylistFromTracks,
} from "@/lib/spotify-actions";

type Visibility = "public" | "private" | "collaborative";

export default function CreatePlaylistButton({
  variant = "primary",
  label = "Nueva playlist",
  initialName = "",
  initialDescription = "",
  tracks,
  stayOnPage = false,
}: {
  variant?: "primary" | "ghost";
  label?: string;
  initialName?: string;
  initialDescription?: string;
  /** If provided, the new playlist will be filled with these track URIs. */
  tracks?: string[];
  /** When true, after creation the dialog shows a success message and
   *  closes without redirecting. Avoids re-fetching the original playlist. */
  stayOnPage?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "primary"
            ? "group inline-flex items-center gap-3 bg-acid text-ink px-5 py-2.5 hover:bg-cream transition-colors"
            : "group inline-flex items-center gap-2 ring-1 ring-rule px-4 py-2 hover:ring-cream transition-colors"
        }
      >
        <span className="label-mono">{label}</span>
        <span
          className={
            variant === "primary"
              ? "font-mono text-sm group-hover:rotate-90 transition-transform duration-300"
              : "font-mono text-sm text-mute group-hover:text-cream transition-colors"
          }
        >
          +
        </span>
      </button>

      {open && (
        <Dialog
          onClose={() => setOpen(false)}
          initialName={initialName}
          initialDescription={initialDescription}
          tracks={tracks}
          stayOnPage={stayOnPage}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------- */

function Dialog({
  onClose,
  initialName,
  initialDescription,
  tracks,
  stayOnPage,
}: {
  onClose: () => void;
  initialName: string;
  initialDescription: string;
  tracks?: string[];
  stayOnPage: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    name: string;
    spotifyUrl?: string;
  } | null>(null);
  const hasTracks = (tracks?.length ?? 0) > 0;

  const submit = () => {
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const input = {
          name,
          description,
          public: visibility === "public",
          collaborative: visibility === "collaborative",
          // Only redirect when not in stay-on-page mode.
          redirectAfter: !stayOnPage,
        };
        const created = hasTracks
          ? await createPlaylistFromTracks(input, tracks!)
          : await createPlaylist(input);
        if (stayOnPage) {
          setSuccess({
            name: created.name,
            spotifyUrl: created.external_urls?.spotify,
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo crear");
      }
    });
  };

  if (success) {
    return (
      <div
        className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-md flex items-center justify-center p-6"
        onClick={onClose}
      >
        <div
          className="bg-ink-2 ring-1 ring-acid w-full max-w-xl rise px-7 py-8"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="label-mono text-acid mb-2">✓ Creada</p>
          <h3 className="display-italic text-4xl mb-3 [text-wrap:balance]">
            {success.name}
          </h3>
          <p className="font-serif italic text-cream-dim mb-6">
            Tu nueva playlist vive ahora en tu cuenta de Spotify. Te quedas
            aquí — no recargamos la original.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={onClose}
              className="group inline-flex items-center gap-3 bg-acid text-ink px-5 py-2.5 hover:bg-cream transition-colors"
            >
              <span className="label-mono">Seguir aquí</span>
              <span className="font-mono text-sm group-hover:translate-x-1 transition-transform">
                ←
              </span>
            </button>
            {success.spotifyUrl && (
              <a
                href={success.spotifyUrl}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-2 ring-1 ring-rule px-4 py-2 hover:ring-cream transition-colors"
              >
                <span className="label-mono text-cream">Ver en Spotify</span>
                <span className="font-mono text-sm text-mute group-hover:text-cream transition-colors">
                  ↗
                </span>
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-md flex items-center justify-center p-6"
      onClick={onClose}
    >
      <form
        className="bg-ink-2 ring-1 ring-rule w-full max-w-xl rise"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="px-7 py-6 hairline-b">
          <p className="label-mono text-acid mb-2">
            {hasTracks ? `Nueva colección · ${tracks!.length} canciones` : "Nueva entrada"}
          </p>
          <h3 className="display-italic text-4xl">Crear playlist</h3>
          <p className="font-serif italic text-cream-dim mt-2">
            {hasTracks
              ? "Materializa el filtro como una playlist nueva en tu cuenta."
              : "Una página en blanco. Tú decides qué pones."}
          </p>
        </div>

        <div className="px-7 py-6 space-y-6">
          <Field label="Nombre" required>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="ej. para correr al amanecer"
              className="w-full bg-transparent ring-1 ring-rule px-3 py-2.5 font-serif text-lg text-cream placeholder:text-mute placeholder:italic focus:outline-none focus:ring-acid transition-shadow"
            />
            <p className="label-mono text-mute mt-1.5 text-right">
              {name.length} / 100
            </p>
          </Field>

          <Field label="Descripción" hint="opcional">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="ej. canciones para el ritual matutino"
              className="w-full bg-transparent ring-1 ring-rule px-3 py-2.5 font-mono text-sm text-cream placeholder:text-mute focus:outline-none focus:ring-acid resize-none transition-shadow"
            />
            <p className="label-mono text-mute mt-1.5 text-right">
              {description.length} / 300
            </p>
          </Field>

          <Field label="Visibilidad">
            <div className="grid grid-cols-3 gap-2">
              <RadioCard
                label="Privada"
                hint="solo tú"
                active={visibility === "private"}
                onSelect={() => setVisibility("private")}
              />
              <RadioCard
                label="Pública"
                hint="visible al mundo"
                active={visibility === "public"}
                onSelect={() => setVisibility("public")}
              />
              <RadioCard
                label="Colab."
                hint="editable por otros"
                active={visibility === "collaborative"}
                onSelect={() => setVisibility("collaborative")}
              />
            </div>
          </Field>

          {error && (
            <p className="label-mono text-blood py-2 px-3 ring-1 ring-blood/40 bg-blood/10">
              {error}
            </p>
          )}
        </div>

        <div className="px-7 py-5 hairline-b border-t flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="label-mono text-mute hover:text-cream transition-colors disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="group inline-flex items-center gap-3 bg-acid text-ink px-5 py-2.5 hover:bg-cream transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="label-mono">
              {pending
                ? hasTracks
                  ? `Creando y añadiendo ${tracks!.length}…`
                  : "Creando…"
                : hasTracks
                  ? `Crear con ${tracks!.length} canciones`
                  : "Crear playlist"}
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
      <div className="flex items-baseline justify-between mb-2">
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

function RadioCard({
  label,
  hint,
  active,
  onSelect,
}: {
  label: string;
  hint: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`px-3 py-3 text-left ring-1 transition-all ${
        active
          ? "ring-acid bg-acid/10"
          : "ring-rule hover:ring-cream-dim"
      }`}
    >
      <p
        className={`label-mono ${active ? "text-acid" : "text-cream"} mb-0.5`}
      >
        {label}
      </p>
      <p className="font-mono text-[10px] text-mute leading-tight">{hint}</p>
    </button>
  );
}
