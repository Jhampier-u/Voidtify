import { sql } from "drizzle-orm";
import { caratula, streams } from "@/db/schema";
import { contadas, type Db } from "@/lib/stats/shared";

export type TipoCaratula = "cancion" | "album";

export type Pendiente = { clave: string; uri: string };

/** Lo que interesa de una pista de Spotify. */
export type PistaSpotify = {
  uri: string;
  album?: { images?: { url: string; width?: number }[] };
};

/**
 * Cuántas se resuelven por tipo en cada captura.
 *
 * Una por petición. La forma en lote de `/tracks?ids=` seria mucho mas barata
 * —cincuenta de golpe— pero devuelve **403** para esta aplicacion, mientras que
 * `/tracks/{id}` sigue dando 200. Es otro endpoint recortado, y no se ve venir:
 * el individual funciona.
 *
 * Quince por tipo son treinta peticiones, unos siete segundos y medio con el
 * limitador. Subirlo alarga cada captura sin ganar gran cosa.
 */
export const POR_CAPTURA = 15;

export const MAX_EDAD_MS = 60 * 86_400_000;

/** Ventana que define «lo que estás escuchando ahora». */
const RECIENTE_DIAS = 90;

const ANCHO_DESEADO = 300;

/** La url más cercana al ancho deseado, o null si no hay imágenes. */
export function mejorCaratula(p: PistaSpotify): string | null {
  const fotos = p.album?.images ?? [];
  if (fotos.length === 0) return null;

  return fotos.reduce((mejor, foto) => {
    const d = Math.abs((foto.width ?? 0) - ANCHO_DESEADO);
    const dMejor = Math.abs((mejor.width ?? 0) - ANCHO_DESEADO);
    return d < dMejor ? foto : mejor;
  }).url;
}

/**
 * Claves sin carátula, con una pista suya que sirva para pedirla.
 *
 * La carátula de un álbum se saca de cualquiera de sus pistas, así que los dos
 * tipos se resuelven por el mismo camino y con una sola consulta a Spotify.
 *
 * Prioriza lo que suena estos días, igual que las fotos de artista: ordenar por
 * el histórico llena la caché con cosas que no están en pantalla.
 */
export function getPendientes(
  db: Db,
  tipo: TipoCaratula,
  limite: number,
  ahoraMs: number,
  maxEdadMs: number = MAX_EDAD_MS,
): Pendiente[] {
  const corte = ahoraMs - maxEdadMs;
  const desde = new Date(ahoraMs - RECIENTE_DIAS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const columna = tipo === "cancion" ? streams.trackKey : streams.albumKey;

  // MAX(track_uri) elige una cualquiera de las pistas del grupo, que es todo lo
  // que hace falta: cualquier pista del álbum lleva la misma carátula.
  return db.all<Pendiente>(sql`
    SELECT
      ${columna}                 AS clave,
      MAX(${streams.trackUri})   AS uri
    FROM ${streams}
    LEFT JOIN ${caratula}
      ON ${caratula.clave} = ${columna} AND ${caratula.tipo} = ${tipo}
    WHERE ${contadas()}
      AND ${columna} IS NOT NULL
      AND ${streams.trackUri} IS NOT NULL
      AND (${caratula.clave} IS NULL OR ${caratula.fetchedAt} < ${corte})
    GROUP BY ${columna}
    ORDER BY
      SUM(CASE WHEN ${streams.localDate} >= ${desde} THEN 1 ELSE 0 END) DESC,
      COUNT(*) DESC
    LIMIT ${limite}
  `);
}

export async function guardarCaratula(
  db: Db,
  tipo: TipoCaratula,
  clave: string,
  url: string | null,
  ahoraMs: number,
): Promise<void> {
  const valores = { tipo, clave, url, fetchedAt: ahoraMs };
  await db
    .insert(caratula)
    .values(valores)
    .onConflictDoUpdate({
      target: [caratula.tipo, caratula.clave],
      set: { url, fetchedAt: ahoraMs },
    });
}

/** Pide una pista por su id. Se inyecta para poder probar sin red. */
export type PedirPista = (id: string) => Promise<PistaSpotify | null>;

export async function rellenarCaratulasEnLote(
  db: Db,
  tipo: TipoCaratula,
  pedir: PedirPista,
  limite: number = POR_CAPTURA,
  ahoraMs: number = Date.now(),
): Promise<{ pedidos: number; conCaratula: number; fallos: number }> {
  const pendientes = getPendientes(db, tipo, limite, ahoraMs);

  let conCaratula = 0;
  let fallos = 0;

  for (const p of pendientes) {
    const id = p.uri.split(":").pop() ?? "";

    let pista: PistaSpotify | null;
    try {
      pista = await pedir(id);
    } catch (e) {
      // Un fallo de red no se anota como «no existe»: eso dejaria el hueco
      // durante dos meses por un corte de un segundo. Pero SI se cuenta y se
      // registra: la version anterior hacia `continue` en silencio, y cuando el
      // endpoint empezo a devolver 403 la funcion parecia no hacer nada sin dar
      // una sola pista de por que.
      fallos += 1;
      if (fallos === 1) {
        console.warn(`[caratulas] fallo al pedir ${id}:`, e);
      }
      continue;
    }

    // El hueco si se anota, para no repetir la consulta en cada pasada.
    const url = pista ? mejorCaratula(pista) : null;
    await guardarCaratula(db, tipo, p.clave, url, ahoraMs);
    if (url) conCaratula += 1;
  }

  return { pedidos: pendientes.length, conCaratula, fallos };
}
