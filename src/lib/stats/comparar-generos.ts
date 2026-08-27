export type Comparado = {
  name: string;
  /**
   * Puestos que ha subido desde el periodo anterior.
   *
   * Positivo sube: bajar de número es mejorar. Null cuando no estaba antes.
   */
  delta: number | null;
};

/**
 * Cómo se ha movido cada género frente al periodo anterior.
 *
 * Se compara la **posición** y no la proporción a propósito. El porcentaje de
 * un género depende de todos los demás: basta con que aparezca un artista nuevo
 * muy escuchado para que todo lo demás baje unas décimas sin haber cambiado
 * nada. El puesto responde a la pregunta que uno se hace de verdad, que es si
 * algo pesa más o menos que antes en relación con el resto.
 */
export function compararGeneros(
  actuales: string[],
  anteriores: string[],
): Comparado[] {
  const puestoAntes = new Map(anteriores.map((n, i) => [n, i]));

  return actuales.map((name, i) => {
    const antes = puestoAntes.get(name);
    return { name, delta: antes === undefined ? null : antes - i };
  });
}

/**
 * Los que estaban en el periodo anterior y ya no aparecen.
 *
 * Se miran solo los primeros del anterior: que el género ciento veinte haya
 * desaparecido no es noticia, y listarlo enterraría los que sí lo son.
 */
export function salieron(
  actuales: string[],
  anteriores: string[],
  cuantos = 12,
): string[] {
  const hay = new Set(actuales);
  return anteriores.slice(0, cuantos).filter((n) => !hay.has(n));
}
