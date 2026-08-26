import { normalizeName } from "./stats/normalize";

/**
 * Búsqueda por nombre y por dueño sobre una lista ya cargada.
 *
 * Módulo puro. No consulta a Spotify: la biblioteca ya tiene las 380 playlists
 * en memoria para poder contar los filtros, así que buscar es filtrar lo que ya
 * está, y no hay motivo para una llamada más.
 */

export type Buscable = {
  name: string;
  owner: { id: string; display_name: string };
};

/**
 * Todos los términos deben aparecer, en cualquier orden y en cualquiera de los
 * dos campos.
 *
 * Un `includes` de la frase entera obligaría a escribir el nombre tal cual:
 * «rock clásico» no encontraría «Classic-Rock», y «cigarettes sex» no
 * encontraría «Cigarettes After Sex». Exigir todos los términos, en cambio,
 * mantiene la búsqueda precisa: escribir más palabras siempre reduce.
 *
 * Se compara sobre el texto normalizado —sin acentos ni mayúsculas— con la
 * misma función que usan las claves de las estadísticas, para que «Sigur Ros»
 * encuentre «Sigur Rós».
 */
export function buscarPlaylists<T extends Buscable>(
  playlists: T[],
  consulta: string,
): T[] {
  const terminos = normalizeName(consulta)
    .split(" ")
    .filter((t) => t.length > 0);

  if (terminos.length === 0) return playlists;

  return playlists.filter((p) => {
    const heno = normalizeName(
      `${p.name ?? ""} ${p.owner?.display_name ?? ""} ${p.owner?.id ?? ""}`,
    );
    return terminos.every((t) => heno.includes(t));
  });
}
