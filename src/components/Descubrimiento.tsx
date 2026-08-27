"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listarDispositivos,
  obtenerPreview,
  obtenerSugerencias,
  reproducir,
  type Dispositivo,
  type Sugerencia,
} from "@/lib/descubrir-actions";
import { createPlaylistFromTracks } from "@/lib/spotify-actions";
import Miniatura from "@/components/stats/Miniatura";
import SelectorSemilla, { type SemillaElegida } from "@/components/SelectorSemilla";

export default function Descubrimiento({ preset }: { preset?: string }) {
  const [semilla, setSemilla] = useState<SemillaElegida | null>(null);
  const [deDonde, setDeDonde] = useState("lo que más escuchas");
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
  // Los fragmentos se piden de uno en uno y se guardan: volver atrás o repetir
  // una tarjeta no debe costar otra consulta a dos APIs ajenas.
  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const [sonando, setSonando] = useState(false);
  const [arrastre, setArrastre] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inicioRef = useRef<number | null>(null);

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
        obtenerSugerencias(
          preset,
          40,
          semilla
            ? { tipo: semilla.tipo, a: semilla.a, b: semilla.b }
            : undefined,
        ),
        listarDispositivos().catch((): Dispositivo[] => []),
      ]);
      setSugerencias(r.sugerencias);
      setDeDonde(r.etiqueta);
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

  /**
   * Trae el fragmento de la tarjeta que se mira y precarga la siguiente.
   *
   * Uno a uno y no las cuarenta de golpe: serían ochenta llamadas a dos APIs
   * ajenas antes de poder enseñar nada, y casi nadie llega al final de la lista.
   */
  useEffect(() => {
    if (!lista) return;
    let vivo = true;

    const traer = (s: Sugerencia | undefined) => {
      if (!s) return;
      setPreviews((p) => {
        if (s.clave in p) return p;
        void obtenerPreview(s.artista, s.titulo)
          .then((url) => vivo && setPreviews((q) => ({ ...q, [s.clave]: url })))
          .catch(() => vivo && setPreviews((q) => ({ ...q, [s.clave]: null })));
        return { ...p, [s.clave]: null };
      });
    };

    traer(lista[indice]);
    traer(lista[indice + 1]);

    return () => {
      vivo = false;
    };
  }, [lista, indice]);

  const urlPreview = actual ? previews[actual.clave] : null;

  // Suena sola al cambiar de tarjeta. El navegador solo lo permite tras una
  // interacción, y pulsar «Buscar sugerencias» ya cuenta como tal.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!urlPreview) {
      a.pause();
      return;
    }
    a.currentTime = 0;
    void a.play().catch(() => {
      // Si el navegador lo bloquea, queda el botón de reproducir.
    });
  }, [urlPreview]);

  const alternarSonido = useCallback(() => {
    const a = audioRef.current;
    if (!a || !urlPreview) return;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  }, [urlPreview]);

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
      <section className="px-8 py-20 max-w-3xl">
        <p className="font-serif italic text-xl text-cream-dim mb-8">
          Canciones que no has escuchado nunca. Puedes partir de lo que más
          escuchas o pedirle que salga de algo concreto.
        </p>

        <div className="mb-8">
          <SelectorSemilla elegida={semilla} onElegir={setSemilla} />
        </div>

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
          <ul className="mb-8 flex flex-wrap gap-2">
            {guardadas.slice(0, 12).map((g) => (
              <li key={g.clave} title={`${g.titulo} — ${g.artista}`}>
                <Miniatura nombre={g.titulo} url={g.caratula} lado={48} />
              </li>
            ))}
          </ul>
        )}

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

      {/* La caratula manda: aqui estas juzgando musica que no conoces, y la
          portada es la mitad de la decision. */}
      {/* El fragmento sale de iTunes o de Deezer: Spotify retiro preview_url.
          `crossOrigin` no hace falta y romperia la peticion en Deezer. */}
      <audio
        ref={audioRef}
        src={urlPreview ?? undefined}
        onPlay={() => setSonando(true)}
        onPause={() => setSonando(false)}
        onEnded={() => setSonando(false)}
        preload="auto"
      />

      <article
        key={actual.clave}
        onTouchStart={(e) => {
          inicioRef.current = e.touches[0].clientX;
        }}
        onTouchMove={(e) => {
          if (inicioRef.current === null) return;
          setArrastre(e.touches[0].clientX - inicioRef.current);
        }}
        onTouchEnd={() => {
          // Un cuarto de pantalla: menos que eso son toques accidentales al
          // desplazarse, y mas obliga a un gesto incomodo con el pulgar.
          const umbral = window.innerWidth / 4;
          if (arrastre > umbral) guardar();
          else if (arrastre < -umbral) pasar();
          inicioRef.current = null;
          setArrastre(0);
        }}
        style={{
          transform: `translateX(${arrastre}px) rotate(${arrastre / 40}deg)`,
          transition: arrastre === 0 ? "transform 220ms ease-out" : "none",
        }}
        className="rise flex touch-pan-y items-end gap-7 flex-wrap"
      >
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-8 rounded-full
                       bg-acid/[0.07] blur-3xl"
          />
          <Miniatura
            nombre={actual.titulo}
            url={actual.caratula}
            lado={200}
            redondeo="rounded-3xl"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="label-mono text-acid mb-4">
            {actual.artistaConocido
              ? "De un artista que ya escuchas"
              : "Artista nuevo para ti"}
            {" · "}
            <span className="text-mute">
              por {actual.desde}
            </span>
          </p>
          <h2 className="display-italic text-[clamp(1.8rem,5vw,3.4rem)] leading-[0.95] break-words mb-3">
            {actual.titulo}
          </h2>
          <p className="font-serif text-xl text-cream-dim">{actual.artista}</p>
        </div>
      </article>

      <div className="flex items-center gap-6 mt-14 flex-wrap">
        <button
          onClick={pasar}
          className="label-mono border border-rule px-5 py-3 hover:text-blood hover:border-blood transition-colors"
        >
          ✗ Pasar
        </button>
        <button
          onClick={alternarSonido}
          disabled={!urlPreview}
          title={
            urlPreview
              ? "Fragmento de 30 s"
              : "No hay fragmento de esta canción"
          }
          className="label-mono border border-current px-5 py-3 transition-colors hover:text-acid disabled:opacity-30"
        >
          {sonando ? "❚❚ Pausa" : "▶ 30 s"}
        </button>
        <button
          onClick={escuchar}
          disabled={!dispositivo}
          title="Reproducir entera en tu Spotify"
          className="label-mono border border-rule px-5 py-3 text-mute transition-colors hover:text-cream disabled:opacity-30"
        >
          ↗ En Spotify
        </button>
        <button
          onClick={guardar}
          className="label-mono border border-acid text-acid px-5 py-3 hover:bg-acid hover:text-ink transition-colors"
        >
          ✓ Guardar
        </button>
        <span className="label-mono text-mute">
          ← pasar · → guardar · o desliza con el dedo
        </span>
      </div>

      {error && <p className="label-mono text-blood mt-6">{error}</p>}

      {semillas.length > 0 && (
        <details className="mt-16">
          <summary className="label-mono text-mute cursor-pointer hover:text-cream">
            De dónde sale todo esto · {deDonde}
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
