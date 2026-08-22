"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listarDispositivos,
  obtenerSugerencias,
  reproducir,
  type Dispositivo,
  type Sugerencia,
} from "@/lib/descubrir-actions";
import { createPlaylistFromTracks } from "@/lib/spotify-actions";

export default function Descubrimiento({ preset }: { preset?: string }) {
  const [sugerencias, setSugerencias] = useState<Sugerencia[] | null>(null);
  const [semillas, setSemillas] = useState<string[]>([]);
  const [indice, setIndice] = useState(0);
  // Casi todo lo que devuelve Last.fm es de artistas que ya escuchas: son
  // canciones nuevas, pero no nombres nuevos. Separar las dos cosas es lo que
  // hace utilizable la lista según lo que busques ese día.
  const [soloNuevos, setSoloNuevos] = useState(false);
  const [guardadas, setGuardadas] = useState<Sugerencia[]>([]);
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [dispositivo, setDispositivo] = useState<string>("");
  const [cargando, setCargando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lista = sugerencias
    ? soloNuevos
      ? sugerencias.filter((s) => !s.artistaConocido)
      : sugerencias
    : null;
  const actual = lista?.[indice];
  const quedan = lista ? lista.length - indice : 0;
  const nuevos = sugerencias?.filter((s) => !s.artistaConocido).length ?? 0;

  const buscar = async () => {
    setCargando(true);
    setError(null);
    try {
      const [r, d] = await Promise.all([
        obtenerSugerencias(preset),
        listarDispositivos().catch((): Dispositivo[] => []),
      ]);
      setSugerencias(r.sugerencias);
      setSemillas(r.semillas);
      setIndice(0);
      setGuardadas([]);
      setDispositivos(d);
      setDispositivo(d.find((x) => x.activo)?.id ?? d[0]?.id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo buscar");
    } finally {
      setCargando(false);
    }
  };

  const escuchar = useCallback(async () => {
    if (!actual || !dispositivo) return;
    try {
      await reproducir(actual.uri, dispositivo);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo reproducir",
      );
    }
  }, [actual, dispositivo]);

  const pasar = useCallback(() => setIndice((i) => i + 1), []);

  const guardar = useCallback(() => {
    if (actual) setGuardadas((g) => [...g, actual]);
    setIndice((i) => i + 1);
  }, [actual]);

  // Atajos de teclado: repasar cuarenta canciones a golpe de ratón es tedioso,
  // y el gesto natural aquí es izquierda/derecha.
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (!actual) return;
      if (e.key === "ArrowRight") guardar();
      else if (e.key === "ArrowLeft") pasar();
      else if (e.key === " ") {
        e.preventDefault();
        void escuchar();
      }
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [actual, guardar, pasar, escuchar]);

  const crearPlaylist = async () => {
    setCreando(true);
    setError(null);
    try {
      await createPlaylistFromTracks(
        {
          name: `Descubrimiento · ${new Date().toLocaleDateString("es")}`,
          description: "Sugerencias de Last.fm que no habías escuchado.",
          public: false,
          redirectAfter: true,
        },
        guardadas.map((g) => g.uri),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear");
      setCreando(false);
    }
  };

  if (!lista) {
    return (
      <section className="px-8 py-20 max-w-2xl">
        <p className="font-serif italic text-xl text-cream-dim mb-8">
          Canciones que no has escuchado nunca, a partir de las que más
          escuchas.
        </p>
        <button
          onClick={buscar}
          disabled={cargando}
          className="label-mono border border-current px-5 py-3 hover:text-acid transition-colors disabled:opacity-40"
        >
          {cargando ? "Buscando…" : "Buscar sugerencias"}
        </button>
        <p className="label-mono text-mute mt-4">
          Tarda unos segundos: consulta Last.fm por cada semilla y luego busca
          cada resultado en Spotify.
        </p>
        {error && <p className="label-mono text-blood mt-4">{error}</p>}
      </section>
    );
  }

  if (!actual) {
    return (
      <section className="px-8 py-20 max-w-2xl">
        <p className="label-mono text-acid mb-4">Se acabaron</p>
        <p className="font-serif italic text-2xl text-cream mb-8">
          Guardaste {guardadas.length}{" "}
          {guardadas.length === 1 ? "canción" : "canciones"}.
        </p>
        {guardadas.length > 0 && (
          <button
            onClick={crearPlaylist}
            disabled={creando}
            className="label-mono border border-current px-5 py-3 hover:text-acid transition-colors disabled:opacity-40"
          >
            {creando ? "Creando…" : "Crear playlist con ellas"}
          </button>
        )}
        <button
          onClick={buscar}
          className="label-mono text-mute hover:text-acid transition-colors ml-6"
        >
          Buscar otra tanda
        </button>
        {error && <p className="label-mono text-blood mt-4">{error}</p>}
      </section>
    );
  }

  return (
    <section className="px-8 py-12 max-w-3xl">
      <div className="flex items-center justify-between label-mono text-mute mb-10 flex-wrap gap-4">
        <span className="num-tabular">
          {quedan} por ver · {guardadas.length} guardadas
        </span>
        <button
          onClick={() => {
            setSoloNuevos((v) => !v);
            setIndice(0);
          }}
          className={`label-mono transition-colors ${
            soloNuevos ? "text-acid" : "text-mute hover:text-cream"
          }`}
        >
          Solo artistas nuevos ({nuevos})
        </button>
        {dispositivos.length > 0 ? (
          <label className="flex items-center gap-2">
            <span>Sonar en</span>
            <select
              value={dispositivo}
              onChange={(e) => setDispositivo(e.target.value)}
              className="bg-ink-2 border border-rule px-2 py-1 font-mono text-xs"
            >
              {dispositivos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span>Abre Spotify en algún dispositivo para poder escuchar</span>
        )}
      </div>

      <article key={actual.clave} className="fade-in">
        <p className="label-mono text-acid mb-4">
          {actual.artistaConocido
            ? "De un artista que ya escuchas"
            : "Artista nuevo para ti"}
          {" · "}
          <span className="text-mute">
            sale de {actual.semillas}{" "}
            {actual.semillas === 1 ? "canción tuya" : "canciones tuyas"}
          </span>
        </p>
        <h2 className="display-italic text-[clamp(2rem,6vw,4rem)] leading-[0.95] break-words mb-3">
          {actual.titulo}
        </h2>
        <p className="font-serif text-xl text-cream-dim">{actual.artista}</p>
      </article>

      <div className="flex items-center gap-6 mt-14 flex-wrap">
        <button
          onClick={pasar}
          className="label-mono border border-rule px-5 py-3 hover:text-blood hover:border-blood transition-colors"
        >
          ✗ Pasar
        </button>
        <button
          onClick={escuchar}
          disabled={!dispositivo}
          className="label-mono border border-current px-5 py-3 hover:text-acid transition-colors disabled:opacity-30"
        >
          ▶ Escuchar
        </button>
        <button
          onClick={guardar}
          className="label-mono border border-acid text-acid px-5 py-3 hover:bg-acid hover:text-ink transition-colors"
        >
          ✓ Guardar
        </button>
        <span className="label-mono text-mute">← pasar · → guardar · espacio suena</span>
      </div>

      {error && <p className="label-mono text-blood mt-6">{error}</p>}

      {semillas.length > 0 && (
        <details className="mt-16">
          <summary className="label-mono text-mute cursor-pointer hover:text-cream">
            De dónde sale todo esto
          </summary>
          <ul className="mt-4 space-y-1">
            {semillas.map((s) => (
              <li key={s} className="font-mono text-xs text-mute">
                {s}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
