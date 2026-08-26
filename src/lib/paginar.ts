/**
 * Recorte de una lista en páginas.
 *
 * Módulo puro. La aritmética de páginas es donde se cuelan los off-by-one, y
 * un fallo aquí no rompe nada visible: enseña la lista equivocada, o esconde el
 * último elemento, y no hay forma de notarlo mirando la pantalla.
 */

export type Pagina<T> = {
  /** Los elementos de esta página. */
  items: T[];
  /** La página realmente mostrada, ya acotada al rango válido. */
  actual: number;
  paginas: number;
  /** Índice del primero dentro de la lista completa, para numerar. */
  desde: number;
};

export function paginar<T>(
  todos: T[],
  pagina: number,
  porPagina: number,
): Pagina<T> {
  const paginas = Math.max(1, Math.ceil(todos.length / porPagina));

  // Se acota en vez de devolver una página vacía: pedir la 99 de una lista de
  // tres es un error de la URL, y enseñar la rejilla vacía parecería que el
  // filtro no tiene nada. Y una página menor que uno no existe.
  const actual = Math.min(Math.max(1, Math.floor(pagina) || 1), paginas);

  const desde = (actual - 1) * porPagina;
  return { items: todos.slice(desde, desde + porPagina), actual, paginas, desde };
}
