/**
 * Formato de duraciones para la interfaz.
 *
 * Módulo puro y sin dependencias: lo usan componentes de servidor y de cliente.
 */

/**
 * Milisegundos a una duración legible.
 *
 * Nunca abrevia los minutos a una sola letra. La clase `label-mono` del
 * sistema aplica `text-transform: uppercase`, así que un «237m» escrito en el
 * código llegaba a la pantalla como **237M** — que junto a 52 reproducciones se
 * lee como doscientos treinta y siete millones. La unidad va entera para que
 * ninguna regla de estilo pueda cambiarle el significado.
 *
 * A partir de hora y media pasa a horas: «237 min» obliga a dividir de cabeza
 * para saber si son cuatro horas o cuarenta.
 */
export function duracion(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 90) return `${min.toLocaleString("es")} min`;

  const horas = Math.floor(min / 60);
  const resto = min % 60;
  return `${horas.toLocaleString("es")} h ${String(resto).padStart(2, "0")}`;
}
