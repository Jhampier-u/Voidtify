"use client";

import { useState, useTransition } from "react";
import { capturarAhora } from "@/lib/capture-actions";
import type { CaptureResult } from "@/lib/capture/run-capture";
import { haceCuanto } from "@/lib/formato";
import { saludCaptura, type EstadoCaptura } from "@/lib/salud-captura";

export type CaptureHealthProps = {
  estado: EstadoCaptura | null;
  lastRunInserted: number | null;
  totalStreams: number;
  /**
   * El ahora lo fija el servidor y viaja como prop.
   *
   * Llamando a `Date.now()` aquí, el render del servidor y el del cliente
   * calculaban «hace N min» en instantes distintos y React avisaba de
   * desajuste en cada carga que cruzara un cambio de minuto.
   */
  ahoraMs: number;
};

export default function CaptureHealth(props: CaptureHealthProps) {
  const [pendiente, startTransition] = useTransition();
  const [resultado, setResultado] = useState<CaptureResult | null>(null);

  const salud = saludCaptura(props.estado, props.ahoraMs);

  const ejecutar = () => {
    startTransition(async () => {
      setResultado(await capturarAhora());
    });
  };

  return (
    <section className="hairline-b px-8 py-10">
      <p className="label-mono text-mute mb-6">Captura en segundo plano</p>

      {salud.nivel !== "ok" && (
        <div
          className={`mb-8 rounded-xl border px-5 py-4 ${
            salud.nivel === "fallo"
              ? "border-blood/40 bg-blood/10"
              : "border-tag-amber/40 bg-tag-amber/10"
          }`}
        >
          <p
            className={`font-serif text-lg ${
              salud.nivel === "fallo" ? "text-blood" : "text-tag-amber"
            }`}
          >
            {salud.titulo}
          </p>
          <p className="dato-mono text-cream-dim mt-2 leading-relaxed break-words">
            {salud.detalle}
          </p>
        </div>
      )}

      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div>
          <dt className="label-mono text-mute">Escuchas capturadas</dt>
          <dd className="num-tabular text-2xl">
            {props.totalStreams.toLocaleString("es")}
          </dd>
        </div>
        <div>
          <dt className="label-mono text-mute">Última ejecución</dt>
          <dd className="num-tabular text-2xl">
            {props.estado?.lastRunAt
              ? haceCuanto(props.estado.lastRunAt, props.ahoraMs)
              : "nunca"}
          </dd>
        </div>
        <div>
          <dt className="label-mono text-mute">Estado</dt>
          {/* En verde solo lo sano: «error» escrito del mismo color que «ok»
              se lee igual de bien y no alarma a nadie. */}
          <dd
            className={`num-tabular text-2xl ${
              props.estado?.lastRunStatus === "ok"
                ? "text-acid"
                : props.estado?.lastRunStatus
                  ? "text-blood"
                  : ""
            }`}
          >
            {props.estado?.lastRunStatus ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="label-mono text-mute">Insertadas</dt>
          <dd className="num-tabular text-2xl">{props.lastRunInserted ?? 0}</dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={ejecutar}
        disabled={pendiente}
        className="label-mono rounded-full border border-current px-5 py-2 transition-colors duration-200 hover:text-acid disabled:opacity-50"
      >
        {pendiente ? "Capturando…" : "Ejecutar ahora"}
      </button>

      {resultado && (
        <p className="dato-mono text-mute mt-4">
          {resultado.status} · {resultado.fetched} leídas ·{" "}
          {resultado.inserted} nuevas
          {resultado.message ? ` · ${resultado.message}` : ""}
        </p>
      )}
    </section>
  );
}
