"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isRateLimit =
    error.message.toLowerCase().includes("rate limit") ||
    error.message.includes("429");

  return (
    <main className="min-h-screen flex items-center justify-center px-5 sm:px-8 py-16">
      <div className="max-w-2xl w-full">
        <p className="label-mono text-blood mb-6">
          {isRateLimit ? "429 — Spotify rate limit" : "Error inesperado"}
        </p>

        <h1 className="display-italic text-5xl md:text-7xl mb-6 [text-wrap:balance]">
          {isRateLimit
            ? "Spotify nos pidió esperar."
            : "Algo se rompió."}
        </h1>

        {isRateLimit ? (
          <div className="space-y-4 font-serif text-cream-dim leading-relaxed">
            <p>
              Hicimos demasiadas peticiones seguidas y Spotify activó un
              cooldown temporal. No es nada permanente — espera unos minutos (a
              veces más) y vuelve a intentar.
            </p>
            <p className="font-mono text-xs text-mute">
              Detalle: {error.message}
            </p>
          </div>
        ) : (
          <div className="space-y-4 font-serif text-cream-dim">
            <p className="italic">{error.message}</p>
            <p className="font-mono text-xs text-mute">
              Si acabas de hacer muchas operaciones seguidas, puede ser un límite
              temporal de Spotify — espera un momento y pulsa Reintentar.
            </p>
            {error.digest && (
              <p className="font-mono text-xs text-mute">
                ID: {error.digest}
              </p>
            )}
          </div>
        )}

        <div className="mt-10 flex items-center gap-3">
          <button
            onClick={reset}
            className="group inline-flex items-center gap-3 bg-acid text-ink px-5 py-2.5 hover:bg-cream transition-colors"
          >
            <span className="label-mono">Reintentar</span>
            <span className="font-mono text-sm group-hover:rotate-180 transition-transform duration-500">
              ↻
            </span>
          </button>
          <Link
            href="/"
            className="label-mono text-mute hover:text-cream transition-colors px-3 py-2.5"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
