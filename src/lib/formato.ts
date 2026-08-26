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

/**
 * Un instante pasado a «hace 20 min», «hace 3 h», «hace 2 días».
 *
 * Recibe el ahora como argumento en vez de llamar a `Date.now()`: así el
 * resultado es el mismo en el render del servidor y en el del cliente, que es
 * justo donde una hora leída dos veces produce un desajuste de hidratación.
 *
 * No baja de la unidad: «hace 90 min» sería más exacto que «hace 1 h», pero
 * aquí la cifra sirve para decidir si algo está roto, y para eso la precisión
 * al minuto no cambia ninguna decisión.
 */
export function haceCuanto(desdeMs: number, ahoraMs: number): string {
  const minutos = Math.floor((ahoraMs - desdeMs) / 60_000);
  if (minutos < 1) return "hace menos de un minuto";
  if (minutos < 60) return `hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;

  const dias = Math.floor(horas / 24);
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}
