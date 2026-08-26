import { sql } from "drizzle-orm";
import { streams } from "@/db/schema";
import type { StatsRange } from "./range";
import { contadas, enRango, type Db } from "./shared";
import { getTopArtists, getTopTracks, getTopAlbums } from "./tops";

export type ArtistTrack = {
  key: string;
  name: string;
  plays: number;
  /** Tiempo escuchado. Sin filtrar por umbral, como en el resto. */
  ms: number;
};

export type ArtistDetail = {
  key: string;
  name: string;
  plays: number;
  ms: number;
  /** Epoch ms de la primera y la última escucha dentro del rango. */
  primeraVez: number;
  ultimaVez: number;
  /**
   * Puesto dentro del propio ranking del usuario, empezando en 1.
   * `null` si el artista queda fuera de los que se consultaron.
   */
  posicion: number | null;
  topTracks: ArtistTrack[];
};

/** Cuántos artistas se miran para calcular la posición. */
const PROFUNDIDAD_RANKING = 1000;

export async function getArtistDetail(
  db: Db,
  range: StatsRange,
  artistKey: string,
): Promise<ArtistDetail | null> {
  const resumen = db.all<{
    name: string | null;
    plays: number;
    ms: number | null;
    primera: number | null;
    ultima: number | null;
  }>(sql`
    SELECT
      MAX(${streams.artistName})  AS name,
      COUNT(*)                    AS plays,
      SUM(${streams.msPlayed})    AS ms,
      MIN(${streams.ts})          AS primera,
      MAX(${streams.ts})          AS ultima
    FROM ${streams}
    WHERE ${enRango(range)} AND ${contadas()}
      AND ${streams.artistKey} = ${artistKey}
  `)[0];

  // Con cero filas, los agregados devuelven NULL y COUNT devuelve 0.
  if (!resumen || resumen.plays === 0) return null;

  const topTracks = db.all<ArtistTrack>(sql`
    SELECT
      ${streams.trackKey}       AS key,
      MAX(${streams.trackName}) AS name,
      COUNT(*)                  AS plays,
      SUM(${streams.msPlayed})  AS ms
    FROM ${streams}
    WHERE ${enRango(range)} AND ${contadas()}
      AND ${streams.artistKey} = ${artistKey}
    GROUP BY ${streams.trackKey}
    ORDER BY plays DESC, name ASC
    LIMIT 10
  `);

  const ranking = await getTopArtists(db, range, "plays", PROFUNDIDAD_RANKING);
  const indice = ranking.findIndex((a) => a.key === artistKey);

  return {
    key: artistKey,
    name: resumen.name ?? artistKey,
    plays: resumen.plays,
    ms: resumen.ms ?? 0,
    primeraVez: resumen.primera ?? 0,
    ultimaVez: resumen.ultima ?? 0,
    posicion: indice >= 0 ? indice + 1 : null,
    topTracks,
  };
}

/* ------------------------------------------------------------------ */
/* Fichas de canción y álbum                                          */
/* ------------------------------------------------------------------ */

export type MesDeEntidad = { month: string; plays: number };

export type TrackDetail = {
  key: string;
  name: string;
  artistName: string;
  artistKey: string;
  plays: number;
  ms: number;
  primeraVez: number;
  ultimaVez: number;
  posicion: number | null;
  /** Cuándo la tuviste en bucle. Solo meses con escuchas. */
  porMes: MesDeEntidad[];
};

export type AlbumTrack = { key: string; name: string; plays: number };

export type AlbumDetail = {
  key: string;
  name: string;
  artistName: string;
  artistKey: string;
  plays: number;
  ms: number;
  primeraVez: number;
  ultimaVez: number;
  posicion: number | null;
  tracks: AlbumTrack[];
};

/**
 * Resumen común a canción y álbum.
 *
 * Las dos fichas piden exactamente los mismos agregados sobre distinta columna
 * de agrupación, así que la consulta se escribe una vez y recibe la columna.
 */
async function resumenDe(
  db: Db,
  range: StatsRange,
  columna: typeof streams.trackKey | typeof streams.albumKey,
  nombre: typeof streams.trackName | typeof streams.albumName,
  clave: string,
) {
  return db.all<{
    name: string | null;
    artist_name: string | null;
    artist_key: string | null;
    plays: number;
    ms: number | null;
    primera: number | null;
    ultima: number | null;
  }>(sql`
    SELECT
      MAX(${nombre})              AS name,
      MAX(${streams.artistName})  AS artist_name,
      MAX(${streams.artistKey})   AS artist_key,
      COUNT(*)                    AS plays,
      SUM(${streams.msPlayed})    AS ms,
      MIN(${streams.ts})          AS primera,
      MAX(${streams.ts})          AS ultima
    FROM ${streams}
    WHERE ${enRango(range)} AND ${contadas()}
      AND ${columna} = ${clave}
  `)[0];
}

export async function getTrackDetail(
  db: Db,
  range: StatsRange,
  trackKey: string,
): Promise<TrackDetail | null> {
  const r = await resumenDe(
    db,
    range,
    streams.trackKey,
    streams.trackName,
    trackKey,
  );
  if (!r || r.plays === 0) return null;

  const porMes = db.all<MesDeEntidad>(sql`
    SELECT
      substr(${streams.localDate}, 1, 7) AS month,
      COUNT(*)                           AS plays
    FROM ${streams}
    WHERE ${enRango(range)} AND ${contadas()}
      AND ${streams.trackKey} = ${trackKey}
    GROUP BY month
    ORDER BY month ASC
  `);

  const ranking = await getTopTracks(db, range, "plays", PROFUNDIDAD_RANKING);
  const indice = ranking.findIndex((t) => t.key === trackKey);

  return {
    key: trackKey,
    name: r.name ?? trackKey,
    artistName: r.artist_name ?? "",
    artistKey: r.artist_key ?? "",
    plays: r.plays,
    ms: r.ms ?? 0,
    primeraVez: r.primera ?? 0,
    ultimaVez: r.ultima ?? 0,
    posicion: indice >= 0 ? indice + 1 : null,
    porMes,
  };
}

export async function getAlbumDetail(
  db: Db,
  range: StatsRange,
  albumKey: string,
): Promise<AlbumDetail | null> {
  const r = await resumenDe(
    db,
    range,
    streams.albumKey,
    streams.albumName,
    albumKey,
  );
  if (!r || r.plays === 0) return null;

  const tracks = db.all<AlbumTrack>(sql`
    SELECT
      ${streams.trackKey}       AS key,
      MAX(${streams.trackName}) AS name,
      COUNT(*)                  AS plays
    FROM ${streams}
    WHERE ${enRango(range)} AND ${contadas()}
      AND ${streams.albumKey} = ${albumKey}
    GROUP BY ${streams.trackKey}
    ORDER BY plays DESC, name ASC
    LIMIT 30
  `);

  const ranking = await getTopAlbums(db, range, "plays", PROFUNDIDAD_RANKING);
  const indice = ranking.findIndex((a) => a.key === albumKey);

  return {
    key: albumKey,
    name: r.name ?? albumKey,
    artistName: r.artist_name ?? "",
    artistKey: r.artist_key ?? "",
    plays: r.plays,
    ms: r.ms ?? 0,
    primeraVez: r.primera ?? 0,
    ultimaVez: r.ultima ?? 0,
    posicion: indice >= 0 ? indice + 1 : null,
    tracks,
  };
}
