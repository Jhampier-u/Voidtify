export type Variacion = {
  /**
   * Cambio en tanto por ciento, redondeado y con signo.
   *
   * Null cuando no hay nada con lo que comparar: o el periodo anterior estuvo
   * a cero, o no existe periodo anterior. Un aumento desde cero no es «un
   * infinito por ciento más», es la primera vez.
   */
  pct: number | null;
  /** Qué pasó, para que quien lo pinte no tenga que deducirlo del signo. */
  sentido: "sube" | "baja" | "igual" | "estreno" | "desconocido";
};

const NADA: Variacion = { pct: null, sentido: "desconocido" };

/**
 * Cuánto ha cambiado una cifra respecto al mismo periodo anterior.
 *
 * Se redondea a entero: la diferencia entre un 12 % y un 12,4 % no cambia
 * ninguna lectura y la coma añade ruido a una cifra que está de acompañante.
 *
 * Un cambio que redondea a cero se declara `igual` en vez de «0 %», que se lee
 * como un dato y no como lo que es: que no ha pasado nada.
 */
export function variacion(ahora: number, antes: number | null): Variacion {
  if (antes === null) return NADA;

  if (antes === 0) {
    // De cero a algo no es un porcentaje, es un estreno. Y de cero a cero no
    // hay nada que contar.
    return ahora > 0
      ? { pct: null, sentido: "estreno" }
      : { pct: null, sentido: "igual" };
  }

  const pct = Math.round(((ahora - antes) / antes) * 100);
  if (pct === 0) return { pct: 0, sentido: "igual" };
  return { pct, sentido: pct > 0 ? "sube" : "baja" };
}
