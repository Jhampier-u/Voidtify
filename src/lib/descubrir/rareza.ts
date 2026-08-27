/**
 * Filtrar descubrimientos por lo conocido que es el artista.
 *
 * Módulo puro. La decisión delicada no es el umbral sino qué hacer con los que
 * todavía no tienen dato: los oyentes se piden de fondo, artista a artista,
 * así que durante unos segundos la mitad de la lista no se sabe.
 */

export type NivelRareza = "todo" | "poco" | "rareza";

/** Oyentes en Last.fm por debajo de los cuales entra cada nivel. */
export const UMBRALES: Record<NivelRareza, number | null> = {
  todo: null,
  poco: 50_000,
  rareza: 5_000,
};

export const ETIQUETAS: Record<NivelRareza, string> = {
  todo: "todo",
  poco: "poco conocido",
  rareza: "rareza",
};

export function esNivel(v: string): v is NivelRareza {
  return v === "todo" || v === "poco" || v === "rareza";
}

/**
 * Si un candidato entra en el nivel pedido.
 *
 * Sin dato **no** pasa el filtro. Dejarlo pasar sería enseñar como rareza algo
 * que a lo mejor tiene diez millones de oyentes, y eso convierte el filtro en
 * un adorno. La pantalla dice cuántos quedan por comprobar para que la lista
 * corta no parezca un error.
 *
 * `null` es «Last.fm no da la cifra», y tampoco pasa. Suele significar que el
 * artista no está en Last.fm, que apunta a rareza, pero también puede ser una
 * consulta que falló — y no hay forma de distinguirlos desde aquí.
 */
export function pasaRareza(
  oyentes: number | null | undefined,
  nivel: NivelRareza,
): boolean {
  const umbral = UMBRALES[nivel];
  if (umbral === null) return true;
  if (typeof oyentes !== "number") return false;
  return oyentes < umbral;
}

/** `1,2 M`, `84 K`, `912`. */
export function oyentesCompactos(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (n >= 1_000) return `${Math.round(n / 1000)} K`;
  return String(n);
}
