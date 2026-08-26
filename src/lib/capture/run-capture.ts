import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { captureState } from "@/db/schema";
import { spotifyFetchHeadless } from "@/lib/spotify-headless";
import { resolveTimeZone } from "@/lib/stats/local-time";
import { insertStreams } from "@/lib/streams";
import {
  mapRecentlyPlayed,
  type RecentlyPlayedResponse,
} from "./map-recently-played";
import { capturarTopsSiToca } from "./top-snapshots";
import { rellenarGenerosEnLote } from "./rellenar-generos";
import {
  rellenarImagenesEnLote,
  type ArtistaSpotify,
} from "./rellenar-imagenes";

const FILA = 1;
const LIMITE = 50;

/** Ventana mínima entre ejecuciones automáticas, para descartar duplicadas. */
const MIN_ENTRE_EJECUCIONES_MS = 30_000;

export type CaptureResult = {
  status: "ok" | "gap" | "omitida" | "error";
  inserted: number;
  fetched: number;
  snapshots: number;
  /** Artistas resueltos contra Last.fm en esta pasada. */
  generos: number;
  /** Fotos de artista resueltas en esta pasada. */
  imagenes: number;
  message?: string;
};

async function leerEstado() {
  const filas = await db
    .select()
    .from(captureState)
    .where(eq(captureState.id, FILA))
    .limit(1);
  return filas[0] ?? null;
}

async function guardarEstado(campos: {
  lastPlayedAt?: number | null;
  lastRunStatus: string;
  lastRunInserted?: number;
  lastError?: string | null;
  gapSuspectedAt?: number | null;
}) {
  const valores = {
    id: FILA,
    lastRunAt: Date.now(),
    lastRunStatus: campos.lastRunStatus,
    lastRunInserted: campos.lastRunInserted ?? 0,
    lastError: campos.lastError ?? null,
    ...(campos.lastPlayedAt !== undefined ? { lastPlayedAt: campos.lastPlayedAt } : {}),
    ...(campos.gapSuspectedAt !== undefined ? { gapSuspectedAt: campos.gapSuspectedAt } : {}),
  };

  await db
    .insert(captureState)
    .values(valores)
    .onConflictDoUpdate({ target: captureState.id, set: valores });
}

/**
 * Una ejecución de captura.
 *
 * @param manual Si es true, salta la protección anti-duplicados. El botón
 * "ejecutar ahora" es una acción deliberada del usuario y debe responder
 * siempre.
 */
/** Busca un artista por nombre con el cliente sin cookie del cron. */
async function buscarArtista(nombre: string): Promise<ArtistaSpotify[]> {
  const q = encodeURIComponent(nombre);
  const r = await spotifyFetchHeadless<{
    artists?: { items?: ArtistaSpotify[] };
  }>(`/search?q=${q}&type=artist&limit=5`, { cache: "no-store" });
  return r.artists?.items ?? [];
}

export async function runCapture(manual = false): Promise<CaptureResult> {
  try {
    const estado = await leerEstado();

    if (
      !manual &&
      estado?.lastRunAt &&
      Date.now() - estado.lastRunAt < MIN_ENTRE_EJECUCIONES_MS
    ) {
      return {
        status: "omitida",
        inserted: 0,
        fetched: 0,
        snapshots: 0,
        generos: 0,
        imagenes: 0,
        message: "Otra ejecución acaba de correr.",
      };
    }

    const timeZone = resolveTimeZone(process.env);

    const params = new URLSearchParams({ limit: String(LIMITE) });
    if (estado?.lastPlayedAt) params.set("after", String(estado.lastPlayedAt));

    const respuesta = await spotifyFetchHeadless<RecentlyPlayedResponse>(
      `/me/player/recently-played?${params}`,
      { cache: "no-store" },
    );

    const items = respuesta.items ?? [];
    const filas = mapRecentlyPlayed(items, timeZone);
    const inserted = await insertStreams(db, filas);

    // Un fallo aquí no debe tumbar la captura de escuchas, que es lo urgente.
    let snapshots = 0;
    try {
      snapshots = await capturarTopsSiToca();
    } catch (e) {
      console.warn("[captura] no se pudieron guardar los tops", e);
    }

    // El vocabulario de generos se rellena aqui, un lote pequeno cada vez.
    // Antes dependia de que alguien abriera /ajustes y pulsara un boton unas
    // doscientas sesenta veces: a las dos semanas habia 40 artistas resueltos
    // de 10.680. Un fallo aqui tampoco debe tumbar la captura de escuchas.
    let generos = 0;
    try {
      generos = (await rellenarGenerosEnLote(db)).pedidos;
    } catch (e) {
      console.warn("[captura] no se pudieron rellenar generos", e);
    }

    // Las fotos de artista, por el mismo camino y con el mismo criterio: los
    // mas escuchados primero, porque son los que salen en pantalla.
    let imagenes = 0;
    try {
      imagenes = (await rellenarImagenesEnLote(db, buscarArtista)).conFoto;
    } catch (e) {
      console.warn("[captura] no se pudieron rellenar imagenes", e);
    }

    const maxTs = filas.reduce((max, f) => (f.ts > max ? f.ts : max), 0);
    const nuevoCursor = maxTs > 0 ? maxTs : (estado?.lastPlayedAt ?? null);

    // Un hueco significa que la ventana de 50 se desbordó entre dos ejecuciones.
    // En la primera, sin cursor previo, todo lo que devuelve Spotify es nuevo por
    // definición: eso es una carga inicial, no una pérdida. Sin esta condición la
    // alerta se enciende el primer día y no se apaga nunca.
    const primeraEjecucion = !estado?.lastPlayedAt;
    const hayHueco =
      !primeraEjecucion &&
      items.length === LIMITE &&
      inserted === filas.length &&
      filas.length > 0;

    await guardarEstado({
      lastPlayedAt: nuevoCursor,
      lastRunStatus: hayHueco ? "gap" : "ok",
      lastRunInserted: inserted,
      lastError: null,
      // Se limpia en una ejecución sana: si no, la primera alerta legítima
      // quedaría encendida de forma permanente y dejaría de significar nada.
      gapSuspectedAt: hayHueco ? Date.now() : null,
    });

    return {
      status: hayHueco ? "gap" : "ok",
      inserted,
      fetched: items.length,
      snapshots,
      generos,
      imagenes,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Si además falla el guardado del error, no se propaga: perderíamos el
    // error original y el cron recibiría una traza en vez de un resultado.
    try {
      await guardarEstado({ lastRunStatus: "error", lastError: message });
    } catch (e2) {
      console.error("[captura] no se pudo registrar el error", e2);
    }
    return {
      status: "error",
      inserted: 0,
      fetched: 0,
      snapshots: 0,
      generos: 0,
      imagenes: 0,
      message,
    };
  }
}

export async function getCaptureState() {
  return leerEstado();
}
