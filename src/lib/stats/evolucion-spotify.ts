/**
 * Cómo se mueve el ranking de Spotify entre una toma y la siguiente.
 *
 * Módulo puro. Las reglas de qué serie se dibuja y qué hueco es un «no estaba»
 * frente a un «no lo sé» se equivocan en silencio: producen una línea plausible
 * que cuenta algo que no pasó.
 */

export type Toma = { takenAt: number; nombres: string[] };

export type Serie = {
  nombre: string;
  /**
   * Puesto en cada toma, o null si no aparecía.
   *
   * Null no es cero: significa que estaba fuera de la lista guardada, no que
   * estuviera el último. Unir los puntos por encima de un hueco dibujaría una
   * caída y una recuperación que nadie vivió.
   */
  posiciones: (number | null)[];
  /** Puesto en la última toma. Siempre presente: la serie sale de ahí. */
  actual: number;
  /** Puestos ganados desde la toma anterior; null si no estaba. */
  delta: number | null;
};

export type Evolucion = {
  tomas: number[];
  series: Serie[];
  /** Estaban en el top de la toma anterior y ya no. */
  salen: string[];
};

/**
 * Compone las series a partir de las tomas, de la más antigua a la más nueva.
 *
 * Solo se siguen los que están en el top `profundidad` de la **última** toma:
 * seguir a todos los que pasaron por ahí en tres meses llenaría la pantalla de
 * líneas de gente que estuvo un día. Sus puestos, en cambio, se miran en la
 * lista completa de cada toma, para que una caída del tres al veintisiete se
 * vea como lo que es y no como una desaparición.
 */
export function construirEvolucion(
  tomas: Toma[],
  profundidad: number,
  normalizar: (s: string) => string,
): Evolucion {
  if (tomas.length === 0) return { tomas: [], series: [], salen: [] };

  const ultima = tomas[tomas.length - 1];
  const seguidos = ultima.nombres.slice(0, profundidad);

  // Un índice por toma evita recorrer cada lista una vez por seguido.
  const indices = tomas.map(
    (t) => new Map(t.nombres.map((n, i) => [normalizar(n), i + 1])),
  );

  const series: Serie[] = seguidos.map((nombre) => {
    const clave = normalizar(nombre);
    const posiciones = indices.map((idx) => idx.get(clave) ?? null);
    const actual = posiciones[posiciones.length - 1] ?? 0;
    const anterior =
      posiciones.length > 1 ? posiciones[posiciones.length - 2] : null;

    return {
      nombre,
      posiciones,
      actual,
      // Positivo sube: bajar de puesto es mejorar.
      delta: anterior === null ? null : anterior - actual,
    };
  });

  // Quién estaba en el top de la penúltima toma y ya no está en el de la última.
  let salen: string[] = [];
  if (tomas.length > 1) {
    const antes = tomas[tomas.length - 2].nombres.slice(0, profundidad);
    const ahora = new Set(seguidos.map(normalizar));
    salen = antes.filter((n) => !ahora.has(normalizar(n)));
  }

  return { tomas: tomas.map((t) => t.takenAt), series, salen };
}
