/**
 * Recorte de una lista en páginas.
 *
 * Módulo puro. La aritmética de páginas es donde se cuelan los off-by-one, y
 * un fallo aquí no rompe nada visible: enseña la lista equivocada, o esconde el
 * último elemento, y no hay forma de notarlo mirando la pantalla.
 */

export type Cuenta = {
  /** La página realmente mostrada, ya acotada al rango válido. */
  actual: number;
  paginas: number;
  /** Índice del primero dentro del total, para numerar o para un OFFSET. */
  desde: number;
};

export type Pagina<T> = Cuenta & {
  /** Los elementos de esta página. */
  items: T[];
};

/**
 * Solo la aritmética, sin la lista.
 *
 * La biblioteca tiene sus playlists en memoria y las recorta; el historial
 * pagina en SQL y solo conoce el total. Los dos necesitan las mismas cuentas y
 * el mismo acotado, así que viven aquí una sola vez.
 */
export function calcularPagina(
  total: number,
  pagina: number,
  porPagina: number,
): Cuenta {
  const paginas = Math.max(1, Math.ceil(total / porPagina));

  // Se acota en vez de devolver una página vacía: pedir la 99 de una lista de
  // tres es un error de la URL, y enseñar la rejilla vacía parecería que el
  // filtro no tiene nada. Y una página menor que uno no existe.
  const actual = Math.min(Math.max(1, Math.floor(pagina) || 1), paginas);

  return { actual, paginas, desde: (actual - 1) * porPagina };
}

export function paginar<T>(
  todos: T[],
  pagina: number,
  porPagina: number,
): Pagina<T> {
  const cuenta = calcularPagina(todos.length, pagina, porPagina);
  return {
    ...cuenta,
    items: todos.slice(cuenta.desde, cuenta.desde + porPagina),
  };
}
