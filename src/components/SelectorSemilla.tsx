"use client";

import { useEffect, useState } from "react";
import Miniatura from "@/components/stats/Miniatura";
import { buscarSemillas, type OpcionSemilla } from "@/lib/descubrir-actions";

export type SemillaElegida = { tipo: string; a: string; b?: string; etiqueta: string };

const NOMBRE_TIPO: Record<string, string> = {
  artista: "artista",
  cancion: "canción",
  album: "álbum",
  genero: "género",
  playlist: "playlist",
};

/**
 * Elige de dónde arranca el descubrimiento.
 *
 * Antes solo había una fuente: tus canciones más escuchadas del rango. Eso
 * responde a «qué más me gustaría», pero no a «quiero algo como esto de aquí»,
 * que es la pregunta que uno se hace de verdad. Ahora se puede partir de un
 * artista, una canción, un álbum, un género o una playlist tuya.
 *
 * Solo busca en lo tuyo, no en el catálogo de Spotify: la idea es «dame más de
 * esto que ya sé que me gusta», y el catálogo entero llenaría la lista de
 * nombres que no reconoces.
 */
export default function SelectorSemilla({
  elegida,
  onElegir,
}: {
  elegida: SemillaElegida | null;
  onElegir: (s: SemillaElegida | null) => void;
}) {
  const [consulta, setConsulta] = useState("");
  const [opciones, setOpciones] = useState<OpcionSemilla[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const q = consulta.trim();
    let vivo = true;

    // Todo el cambio de estado va dentro del temporizador y no en el cuerpo
    // del efecto: `react-hooks/set-state-in-effect` prohíbe lo segundo, y con
    // razón — un `setState` sincrónico aquí provoca un render de más en cada
    // pulsación.
    const id = setTimeout(() => {
      if (!vivo) return;
      if (q.length < 2) {
        setOpciones([]);
        setBuscando(false);
        return;
      }
      setBuscando(true);
      buscarSemillas(q)
        .then((r) => vivo && setOpciones(r))
        .catch(() => vivo && setOpciones([]))
        .finally(() => vivo && setBuscando(false));
    }, 300);

    return () => {
      vivo = false;
      clearTimeout(id);
    };
  }, [consulta]);

  return (
    <div>
      <p className="label-mono text-mute mb-3">Partir de</p>

      {elegida ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 rounded-full bg-ink-2 py-1.5 pl-4 pr-2 ring-1 ring-acid/40">
            <span className="font-serif text-cream">{elegida.etiqueta}</span>
            <span className="dato-mono text-mute">
              {NOMBRE_TIPO[elegida.tipo] ?? elegida.tipo}
            </span>
            <button
              type="button"
              onClick={() => onElegir(null)}
              aria-label="Quitar"
              className="label-mono rounded-full px-2 text-mute transition-colors hover:text-blood"
            >
              ✗
            </button>
          </span>
        </div>
      ) : (
        <>
          <input
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Un artista, una canción, un álbum, un género, una playlist…"
            className="w-full max-w-xl rounded-xl bg-ink-2 px-4 py-3 font-serif
                       text-cream placeholder:text-mute
                       outline-none ring-1 ring-rule focus:ring-acid/50"
          />

          {buscando && opciones.length === 0 && (
            <p className="dato-mono text-mute mt-3">buscando…</p>
          )}

          {opciones.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {opciones.map((o) => (
                <li key={`${o.tipo}-${o.a}-${o.b ?? ""}`}>
                  <button
                    type="button"
                    onClick={() =>
                      onElegir({
                        tipo: o.tipo,
                        a: o.a,
                        b: o.b,
                        etiqueta: o.nombre,
                      })
                    }
                    className="group flex items-center gap-2 rounded-full bg-ink-2/60 py-1 pl-1 pr-3
                               ring-1 ring-rule transition-colors hover:ring-acid/50
                               outline-none focus-visible:ring-acid"
                  >
                    <Miniatura
                      nombre={o.nombre}
                      url={o.imagen}
                      lado={28}
                      redondeo="rounded-full"
                    />
                    <span className="max-w-[16rem] truncate transition-colors group-hover:text-acid">
                      {o.nombre}
                    </span>
                    <span className="dato-mono shrink-0 text-mute">
                      {o.detalle ?? NOMBRE_TIPO[o.tipo]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="dato-mono text-mute mt-3">
            o déjalo vacío y saldrá de lo que más escuchas
          </p>
        </>
      )}
    </div>
  );
}
