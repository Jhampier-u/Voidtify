import { sql } from "drizzle-orm";
import { artistImagen, streams } from "@/db/schema";
import { artistKey } from "@/lib/stats/normalize";
import { contadas, type Db } from "@/lib/stats/shared";

export type ArtistaSinImagen = { key: string; name: string };

/** Lo que devuelve el buscador de artistas de Spotify, recortado. */
export type ArtistaSpotify = {
  id: string;
  name: string;
  images?: { url: string; width?: number }[];
};

/** Cuántos se resuelven en cada captura. */
export const POR_CAPTURA = 15;

/**
 * Cuándo se vuelve a pedir la foto de un artista ya resuelto.
 *
 * Las urls del CDN de Spotify no son eternas. Como se guarda el id, refrescar
 * es barato; lo caro es la búsqueda por nombre, y esa no se repite.
 */
export const MAX_EDAD_MS = 60 * 86_400_000;

/**
 * Se prefiere una imagen mediana.
 *
 * La de 640 px pesa de más para una fila de 48; la de 160 se ve borrosa en
 * pantallas de densidad doble, que son la mayoría.
 */
const ANCHO_DESEADO = 320;

/**
 * Elige, de los resultados de la búsqueda, el artista que de verdad es.
 *
 * Spotify devuelve lo más parecido cuando no encuentra lo pedido, así que el
 * primer resultado de «Duster» puede ser cualquier otro. Sin comparar el
 * nombre acabarías con la cara de un desconocido presidiendo tu top, y eso es
 * peor que no enseñar foto: un hueco se entiende, un error no se detecta.
 *
 * Módulo puro y exportado para poder probarlo: es la única parte que puede
 * equivocarse en silencio.
 */
export function elegirArtista(
  resultados: ArtistaSpotify[],
  claveEsperada: string,
): ArtistaSpotify | null {
  for (const r of resultados) {
    if (artistKey(r.name) !== claveEsperada) continue;
    // Sin fotos no sirve de nada, aunque el nombre coincida: se sigue mirando
    // por si otro resultado con el mismo nombre sí las tiene.
    if (r.images?.length) return r;
  }
  return null;
}

/** La url más cercana al ancho deseado. */
export function mejorImagen(a: ArtistaSpotify): string | null {
  const fotos = a.images ?? [];
  if (fotos.length === 0) return null;

  return fotos.reduce((mejor, foto) => {
    const d = Math.abs((foto.width ?? 0) - ANCHO_DESEADO);
    const dMejor = Math.abs((mejor.width ?? 0) - ANCHO_DESEADO);
    return d < dMejor ? foto : mejor;
  }).url;
}

/** Ventana que define «lo que estás escuchando ahora». */
const RECIENTE_DIAS = 90;

/**
 * Artistas cuya foto falta o ha caducado, priorizando los que suenan ahora.
 *
 * Ordenar por escuchas de todos los tiempos parecía lo natural y era un error:
 * las pantallas muestran por defecto las últimas cuatro semanas, y el top
 * histórico puede no compartir un solo nombre con el reciente. Al probarlo,
 * ninguno de los diez artistas visibles tenía foto pese a haber quince
 * resueltos — la función parecía rota sin estarlo.
 *
 * Manda la actividad reciente, y el total desempata: así lo primero que se
 * llena es justo lo que hay en pantalla.
 */
export function getArtistasSinImagen(
  db: Db,
  limite: number,
  ahoraMs: number,
  maxEdadMs: number = MAX_EDAD_MS,
): ArtistaSinImagen[] {
  const corte = ahoraMs - maxEdadMs;
  const desde = new Date(ahoraMs - RECIENTE_DIAS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  return db.all<ArtistaSinImagen>(sql`
    SELECT
      ${streams.artistKey}       AS key,
      MAX(${streams.artistName}) AS name
    FROM ${streams}
    LEFT JOIN ${artistImagen} ON ${artistImagen.artistKey} = ${streams.artistKey}
    WHERE ${contadas()}
      AND (${artistImagen.artistKey} IS NULL OR ${artistImagen.fetchedAt} < ${corte})
    GROUP BY ${streams.artistKey}
    ORDER BY
      SUM(CASE WHEN ${streams.localDate} >= ${desde} THEN 1 ELSE 0 END) DESC,
      COUNT(*) DESC
    LIMIT ${limite}
  `);
}

export async function guardarImagen(
  db: Db,
  clave: string,
  spotifyId: string | null,
  url: string | null,
  ahoraMs: number,
): Promise<void> {
  const valores = { artistKey: clave, spotifyId, url, fetchedAt: ahoraMs };
  await db
    .insert(artistImagen)
    .values(valores)
    .onConflictDoUpdate({ target: artistImagen.artistKey, set: valores });
}

/** Busca un artista por nombre. Se inyecta para poder probar sin red. */
export type BuscadorArtista = (nombre: string) => Promise<ArtistaSpotify[]>;

export async function rellenarImagenesEnLote(
  db: Db,
  buscar: BuscadorArtista,
  limite: number = POR_CAPTURA,
  ahoraMs: number = Date.now(),
): Promise<{ pedidos: number; conFoto: number }> {
  const pendientes = getArtistasSinImagen(db, limite, ahoraMs);

  let conFoto = 0;
  for (const a of pendientes) {
    let elegido: ArtistaSpotify | null = null;
    try {
      elegido = elegirArtista(await buscar(a.name), a.key);
    } catch {
      // Un fallo de red no se guarda como "no existe": eso dejaria al artista
      // sin foto durante dos meses por un corte de un segundo.
      continue;
    }

    // El fallo si se guarda: hay artistas que Spotify no tiene, y sin anotarlo
    // se volverian a buscar en cada captura para siempre.
    await guardarImagen(
      db,
      a.key,
      elegido?.id ?? null,
      elegido ? mejorImagen(elegido) : null,
      ahoraMs,
    );
    if (elegido) conFoto += 1;
  }

  return { pedidos: pendientes.length, conFoto };
}
