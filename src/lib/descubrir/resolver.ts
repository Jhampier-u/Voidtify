import { inArray } from "drizzle-orm";
import { lastfmResolucion } from "@/db/schema";
import type { Db } from "@/lib/stats/shared";

export type ParaResolver = {
  clave: string;
  artista: string;
  titulo: string;
};

/** Busca un tema en el catálogo de Spotify. Devuelve su URI o null. */
export type Buscador = (artista: string, titulo: string) => Promise<string | null>;

/**
 * Cuánto se espera antes de repetir una búsqueda que no encontró nada.
 *
 * Los aciertos no caducan: un URI no deja de ser el de esa canción. Los fallos
 * sí, porque el catálogo de Spotify cambia y algo que hoy no está puede
 * aparecer. Sin esta espera, cada visita repetiría todas las búsquedas
 * infructuosas contra la API.
 */
const REINTENTO_FALLOS_MS = 30 * 86_400_000;

const POR_LOTE = 400;

function lotes<T>(v: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < v.length; i += n) out.push(v.slice(i, i + n));
  return out;
}

/**
 * Traduce candidatos de Last.fm a URIs de Spotify, apoyándose en la caché.
 *
 * El buscador se recibe como argumento en vez de importarse: así los tests
 * comprueban la política de caché sin tocar la red, que es donde están las
 * decisiones que pueden salir mal.
 */
export async function resolverUris(
  db: Db,
  items: ParaResolver[],
  buscar: Buscador,
  ahoraMs: number,
): Promise<Map<string, string | null>> {
  const resultado = new Map<string, string | null>();
  if (items.length === 0) return resultado;

  const unicos = [...new Map(items.map((i) => [i.clave, i])).values()];

  // Lo que ya está resuelto y sigue siendo válido.
  const pendientes: ParaResolver[] = [];
  const porClave = new Map(unicos.map((i) => [i.clave, i]));

  for (const lote of lotes(unicos.map((i) => i.clave), POR_LOTE)) {
    const filas = await db
      .select()
      .from(lastfmResolucion)
      .where(inArray(lastfmResolucion.clave, lote));

    for (const f of filas) {
      const caducado =
        f.trackUri === null && ahoraMs - f.fetchedAt > REINTENTO_FALLOS_MS;
      if (!caducado) {
        resultado.set(f.clave, f.trackUri);
        porClave.delete(f.clave);
      }
    }
  }

  pendientes.push(...porClave.values());

  for (const p of pendientes) {
    let uri: string | null = null;
    try {
      uri = await buscar(p.artista, p.titulo);
    } catch (e) {
      // Un fallo de red no debe guardarse como "no existe": eso lo dejaría
      // marcado como inencontrable durante treinta días.
      console.warn(`[descubrir] búsqueda fallida de "${p.titulo}"`, e);
      resultado.set(p.clave, null);
      continue;
    }

    resultado.set(p.clave, uri);
    await db
      .insert(lastfmResolucion)
      .values({ clave: p.clave, trackUri: uri, fetchedAt: ahoraMs })
      .onConflictDoUpdate({
        target: lastfmResolucion.clave,
        set: { trackUri: uri, fetchedAt: ahoraMs },
      });
  }

  return resultado;
}
