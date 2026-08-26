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

const DIAS = [
  "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo",
];

const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * `2026-08-25` a «martes, 25 de agosto».
 *
 * Se calcula a mano en vez de con `toLocaleDateString` porque construir una
 * fecha desde `YYYY-MM-DD` y formatearla arrastra la zona horaria del proceso:
 * al oeste de Greenwich la medianoche cae en el día anterior, y cada cabecera
 * del historial mostraría la fecha de la víspera.
 *
 * El año solo se escribe cuando no es el que se le pasa como actual: en una
 * lista de días seguidos, repetirlo en cada cabecera es ruido.
 */
export function fechaLarga(localDate: string, anioActual?: number): string {
  const [a, m, d] = localDate.split("-").map(Number);
  const diaSemana = (new Date(Date.UTC(a, m - 1, d)).getUTCDay() + 6) % 7;

  const base = `${DIAS[diaSemana]}, ${d} de ${MESES_LARGOS[m - 1]}`;
  return a === anioActual ? base : `${base} de ${a}`;
}

/**
 * `3:24`, el formato de un reproductor.
 *
 * En el historial cada fila es una reproducción concreta, y ahí los segundos
 * son el dato: `duracion` redondearía «45 s» a «1 min» y se perdería lo único
 * que distingue una canción escuchada de una saltada a los diez segundos.
 */
export function duracionCorta(ms: number): string {
  const seg = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(seg / 60);
  return `${min}:${String(seg % 60).padStart(2, "0")}`;
}
