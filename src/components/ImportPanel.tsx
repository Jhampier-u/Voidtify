"use client";

import { useState } from "react";
import {
  importarArchivo,
  cerrarImportacion,
  type ArchivoDisponible,
  type ResultadoArchivo,
} from "@/lib/import/import-actions";

/**
 * Importa los archivos de uno en uno desde el cliente.
 *
 * Un solo `await` para veintidós archivos y trescientos mil registros sería una
 * petición de varios minutos, expuesta a cualquier timeout intermedio y sin
 * forma de saber por dónde iba. Recorriendo la lista se ve el avance y, si algo
 * falla, se sabe exactamente en qué archivo.
 */
export default function ImportPanel({
  archivos,
}: {
  archivos: ArchivoDisponible[];
}) {
  const [corriendo, setCorriendo] = useState(false);
  const [hechos, setHechos] = useState<ResultadoArchivo[]>([]);
  const [cierre, setCierre] = useState<string | null>(null);

  const importar = async () => {
    setCorriendo(true);
    setHechos([]);
    setCierre(null);

    const resultados: ResultadoArchivo[] = [];
    let desde: number | null = null;
    let hasta: number | null = null;

    for (const a of archivos) {
      const r = await importarArchivo(a.nombre);
      resultados.push(r);
      setHechos([...resultados]);

      if (r.desde !== null && (desde === null || r.desde < desde)) desde = r.desde;
      if (r.hasta !== null && (hasta === null || r.hasta > hasta)) hasta = r.hasta;
    }

    const { borradas } = await cerrarImportacion(desde, hasta);
    setCierre(
      borradas > 0
        ? `${borradas} escuchas capturadas se sustituyeron por las del dump.`
        : "No hubo solapamiento con lo capturado.",
    );
    setCorriendo(false);
  };

  const totalInsertadas = hechos.reduce((n, r) => n + r.insertados, 0);
  const conError = hechos.filter((r) => r.error);

  return (
    <section className="hairline-b px-5 sm:px-8 py-10">
      <p className="label-mono text-mute mb-6">Importar historial</p>

      {archivos.length === 0 ? (
        <p className="font-serif italic text-cream-dim max-w-lg">
          No hay archivos en <span className="font-mono not-italic">data/import</span>.
          Descomprime ahí el <em>Extended Streaming History</em> que te envió
          Spotify — los archivos que empiezan por{" "}
          <span className="font-mono not-italic">Streaming_History_Audio</span>.
        </p>
      ) : (
        <>
          <p className="font-serif italic text-cream-dim mb-6">
            {archivos.length} archivos listos.{" "}
            {archivos.some((a) => a.importadoAntes) && (
              <>Alguno ya se importó antes; volver a hacerlo no duplica nada.</>
            )}
          </p>

          <button
            type="button"
            onClick={importar}
            disabled={corriendo}
            className="label-mono border border-current px-4 py-2 disabled:opacity-50"
          >
            {corriendo
              ? `Importando… ${hechos.length}/${archivos.length}`
              : "Importar todo"}
          </button>

          {hechos.length > 0 && (
            <div className="mt-8">
              <p className="label-mono text-mute mb-3">
                {totalInsertadas.toLocaleString("es")} escuchas nuevas
              </p>

              <ul className="max-h-64 overflow-y-auto">
                {hechos.map((r) => (
                  <li
                    key={r.nombre}
                    className="flex items-baseline justify-between gap-4 py-1.5 hairline-b"
                  >
                    <span className="font-mono text-xs truncate">{r.nombre}</span>
                    <span
                      className={`label-mono num-tabular whitespace-nowrap ${
                        r.error ? "text-blood" : "text-mute"
                      }`}
                    >
                      {r.error ?? `+${r.insertados.toLocaleString("es")}`}
                    </span>
                  </li>
                ))}
              </ul>

              {conError.length > 0 && (
                <p className="label-mono text-blood mt-4">
                  {conError.length} archivos fallaron.
                </p>
              )}

              {cierre && (
                <p className="label-mono text-acid mt-4">{cierre}</p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
