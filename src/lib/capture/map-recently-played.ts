/**
 * Conversión de la respuesta de /me/player/recently-played a filas `streams`.
 *
 * Módulo puro: sin red, sin base de datos, sin `server-only`.
 */
import type { NewStreamRow } from "@/db/schema";
import { albumKey, artistKey, trackKey } from "@/lib/stats/normalize";
import { localParts } from "@/lib/stats/local-time";

export type RecentlyPlayedTrack = {
  uri: string;
  name: string;
  duration_ms: number;
  artists: { id: string; name: string }[];
  album: { id: string; name: string } | null;
};

export type RecentlyPlayedItem = {
  played_at: string;
  /** El fork de feb 2026 renombró `track` a `item` en playlists. */
  track?: RecentlyPlayedTrack | null;
  item?: RecentlyPlayedTrack | null;
};

export type RecentlyPlayedResponse = {
  items: RecentlyPlayedItem[];
  cursors?: { after?: string; before?: string } | null;
};

/**
 * Hueco máximo que se acepta como «una escucha pegada a la anterior».
 *
 * Media hora. Por encima, el hueco no mide una reproducción sino una pausa, y
 * usarlo daría por sonada entera una canción que se quedó a medias antes de
 * que alguien se fuera a cenar.
 */
const MAX_HUECO_MS = 30 * 60_000;

/**
 * Convierte los items en filas, calculando cuánto sonó cada una.
 *
 * `played_at` es el **final** de la reproducción, no el principio. Se comprobó
 * contra el volcado, donde `ms_played` sí es real: el hueco entre dos marcas
 * coincide con lo que sonó la **segunda** en el 85 % de los casos y con lo que
 * sonó la primera solo en el 13 %.
 *
 * Así que el hueco desde la escucha anterior acota lo que sonó esta. Antes se
 * guardaba la duración entera, y sobre estos datos eso inflaba el tiempo un
 * 17 % frente a como lo mide el volcado: la portada decía más minutos de los
 * que hubo.
 *
 * Cuando no hay vecino utilizable —la primera de todas, o la primera tras una
 * pausa larga— se vuelve a la duración completa. Es una sobreestimación, pero
 * acotada: Spotify solo lista lo que pasó de unos treinta segundos, así que la
 * verdad está entre esos treinta segundos y la duración.
 */
export function mapRecentlyPlayed(
  items: RecentlyPlayedItem[],
  timeZone: string,
  /** `ts` de la última escucha ya guardada, para acotar la primera del lote. */
  anteriorTs?: number | null,
): NewStreamRow[] {
  const filas: NewStreamRow[] = [];

  // La API los devuelve del más reciente al más antiguo. Para medir huecos hay
  // que recorrerlos en el orden en que sonaron.
  const ordenados = [...items].sort((a, b) => {
    const x = Date.parse(a.played_at);
    const y = Date.parse(b.played_at);
    return (Number.isNaN(x) ? 0 : x) - (Number.isNaN(y) ? 0 : y);
  });

  let previo = anteriorTs ?? null;

  for (const entrada of ordenados) {
    const pista = entrada.item ?? entrada.track;
    if (!pista) continue;

    const artista = pista.artists?.[0]?.name;
    if (!artista || !pista.name) continue;

    const ts = Date.parse(entrada.played_at);
    if (Number.isNaN(ts)) continue;

    const duracion = pista.duration_ms ?? 0;
    const hueco = previo === null ? null : ts - previo;
    const msPlayed =
      hueco !== null && hueco > 0 && hueco <= MAX_HUECO_MS
        ? Math.min(hueco, duracion)
        : duracion;
    previo = ts;

    const uri = pista.uri?.trim() ? pista.uri : null;
    const album = pista.album?.name ?? null;
    const claveTrack = trackKey(artista, pista.name);
    const { localDate, localHour } = localParts(ts, timeZone);

    filas.push({
      ts,
      msPlayed,
      trackUri: uri,
      trackName: pista.name,
      artistName: artista,
      albumName: album,
      trackKey: claveTrack,
      artistKey: artistKey(artista),
      albumKey: album ? albumKey(artista, album) : null,
      localDate,
      localHour,
      reasonStart: null,
      reasonEnd: null,
      shuffle: null,
      skipped: null,
      platform: null,
      source: "live",
      dedupKey: `${ts}:${uri ?? claveTrack}`,
    });
  }

  return filas;
}
