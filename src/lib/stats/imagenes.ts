import { inArray, isNotNull, and } from "drizzle-orm";
import { artistImagen } from "@/db/schema";
import type { Db } from "./shared";

/**
 * Fotos de artista ya resueltas, indexadas por clave.
 *
 * Solo devuelve las que existen. Las que faltan se distinguen así de las que
 * se buscaron y no se encontraron, y quien pinta decide qué poner en el hueco
 * en vez de recibir una cadena vacía que parece una url rota.
 */
export async function getImagenesDeArtistas(
  db: Db,
  claves: string[],
): Promise<Record<string, string>> {
  if (claves.length === 0) return {};

  const filas = await db
    .select({ clave: artistImagen.artistKey, url: artistImagen.url })
    .from(artistImagen)
    .where(
      and(inArray(artistImagen.artistKey, claves), isNotNull(artistImagen.url)),
    );

  const salida: Record<string, string> = {};
  for (const f of filas) if (f.url) salida[f.clave] = f.url;
  return salida;
}
