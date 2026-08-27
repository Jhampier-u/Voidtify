import { artistKey, trackKey } from "@/lib/stats/normalize";

/**
 * Elegir la vista previa correcta entre lo que devuelve una búsqueda por texto.
 *
 * Módulo puro: no habla con la red. Aquí está la decisión que puede fallar en
 * silencio —engancharse a una versión en directo, a un remix o directamente a
 * otro artista— y tenerla aparte permite probarla sin inventar respuestas HTTP.
 *
 * El riesgo es real, no teórico: buscando «Filtro Suerte» en iTunes, el primer
 * resultado es correcto pero el segundo es «Los Tucanes de Tijuana — El
 * Sierra». Sin comprobar el artista, uno de cada varios previos sonaría a otra
 * canción y el descubrimiento se volvería ruido.
 */

export type Candidata = {
  artista: string;
  titulo: string;
  /** Url del fragmento. Las candidatas sin ella no sirven de nada. */
  preview?: string | null;
};

/**
 * Los artistas que aparecen en un crédito.
 *
 * iTunes junta las colaboraciones en una sola cadena —«Francisco el Gallo
 * Elizalde, Joel Elizalde & La Bohemia Vip»— y buscar el artista pedido como
 * cadena entera fallaría en todas las colaboraciones.
 */
function partesDeArtista(credito: string): string[] {
  return credito
    .split(/,| & | y | feat\.?| ft\.?| con | with /i)
    .map((p) => artistKey(p))
    .filter(Boolean);
}

function mismoArtista(buscado: string, encontrado: string): boolean {
  const clave = artistKey(buscado);
  if (!clave) return false;
  return partesDeArtista(encontrado).includes(clave);
}

/**
 * La mejor vista previa, o null si ninguna candidata es de fiar.
 *
 * Se exige que el artista coincida y se prefiere el título exacto. Cuando no
 * hay título exacto se acepta la primera del mismo artista: suele ser una
 * remasterización o una edición distinta de la misma canción, que para
 * escuchar treinta segundos vale igual.
 *
 * Devuelve null antes que arriesgarse. Una tarjeta sin sonido se entiende; una
 * tarjeta que suena a otra cosa hace que no te fíes de ninguna.
 */
export function elegirPreview(
  buscado: { artista: string; titulo: string },
  candidatas: Candidata[],
): string | null {
  const conPreview = candidatas.filter(
    (c) => typeof c.preview === "string" && c.preview.trim() !== "",
  );
  if (conPreview.length === 0) return null;

  const delArtista = conPreview.filter((c) => mismoArtista(buscado.artista, c.artista));
  if (delArtista.length === 0) return null;

  const clave = trackKey(buscado.artista, buscado.titulo);
  const exacta = delArtista.find(
    (c) => trackKey(buscado.artista, c.titulo) === clave,
  );

  return (exacta ?? delArtista[0]).preview!.trim();
}
