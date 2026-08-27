import "server-only";
import { sql } from "drizzle-orm";
import { caratula, streams } from "@/db/schema";
import { contadas, enRango, type Db } from "@/lib/stats/shared";
import type { StatsRange } from "@/lib/stats/range";
import { getTotals } from "@/lib/stats/totals";
import { getTopArtists, getTopTracks } from "@/lib/stats/tops";
import { getStreaks } from "@/lib/stats/streaks";
import { getImagenesDeArtistas, getCaratulas } from "@/lib/stats/imagenes";
import type { DatosTarjeta } from "./tipos";

/** Cuántas carátulas se piden para el mosaico del resumen. */
const MOSAICO = 30;

/**
 * Las carátulas de álbum más sonadas del rango, para el mosaico.
 *
 * Por álbum y no por canción: dos canciones del mismo disco comparten portada y
 * el mosaico saldría con la misma imagen repetida al lado de sí misma.
 */
async function mosaicoDelRango(db: Db, range: StatsRange): Promise<string[]> {
  const filas = db.all<{ url: string }>(sql`
    SELECT ${caratula.url} AS url
    FROM ${streams}
    JOIN ${caratula}
      ON ${caratula.clave} = ${streams.albumKey} AND ${caratula.tipo} = 'album'
    WHERE ${enRango(range)} AND ${contadas()} AND ${caratula.url} IS NOT NULL
    GROUP BY ${caratula.clave}
    ORDER BY COUNT(*) DESC
    LIMIT ${MOSAICO}
  `);
  return filas.map((f) => f.url);
}

/**
 * Todo lo que puede necesitar una tarjeta, de una vez.
 *
 * Se piden los datos de las cuatro aunque solo se dibuje una: son consultas
 * baratas sobre índices y la alternativa era un `switch` que decide qué pedir,
 * con cuatro caminos que se desincronizan del dibujo en cuanto uno cambia.
 */
export async function datosDeTarjeta(
  db: Db,
  range: StatsRange,
  hoy: string,
): Promise<DatosTarjeta> {
  const [totals, artistas, canciones, rachas, mosaico] = await Promise.all([
    getTotals(db, range),
    getTopArtists(db, range, "plays", 11),
    getTopTracks(db, range, "plays", 10),
    getStreaks(db, hoy),
    mosaicoDelRango(db, range),
  ]);

  const [fotos, portadas] = await Promise.all([
    getImagenesDeArtistas(db, artistas.map((a) => a.key)),
    getCaratulas(db, "cancion", canciones.map((c) => c.key)),
  ]);

  return {
    etiqueta: range.label,
    periodo: `${range.fromDate} — ${range.toDate}`,
    horas: Math.round(totals.msTotal / 3_600_000),
    reproducciones: totals.reproducciones,
    artistas: totals.artistas,
    canciones: totals.canciones,
    racha: rachas.actual,
    rachaMaxima: rachas.maxima,
    topArtistas: artistas.map((a) => ({
      nombre: a.name,
      plays: a.plays,
      ms: a.ms,
      imagen: fotos[a.key],
    })),
    topCanciones: canciones.map((c) => ({
      nombre: c.name,
      secundario: c.artistName,
      plays: c.plays,
      ms: c.ms,
      imagen: portadas[c.key],
    })),
    mosaico,
  };
}
