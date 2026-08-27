/**
 * Resolución de rangos temporales.
 *
 * Todas las consultas de estadísticas reciben un `StatsRange`. Los presets y el
 * rango libre producen la misma estructura, así que "mis top artistas entre
 * marzo y julio de 2019" no es un caso especial: es el caso general con otras
 * fechas.
 *
 * Los límites son **fechas locales inclusivas** ('YYYY-MM-DD' en STATS_TZ), no
 * marcas de tiempo epoch, y las consultas filtran por la columna `local_date`.
 * Filtrar por `ts` en UTC desplazaba cada extremo cinco horas respecto al día
 * local del usuario, y hacía que un preset y un rango manual equivalente
 * devolvieran cifras distintas. Ver D9 en el documento de diseño.
 *
 * Módulo puro: sin `server-only`, sin base de datos.
 */
import { localParts } from "./local-time";

export type PresetId = "4w" | "6m" | "year" | "all";

export type StatsRange = {
  /** 'YYYY-MM-DD' en STATS_TZ, inclusiva. */
  fromDate: string;
  /** 'YYYY-MM-DD' en STATS_TZ, inclusiva. */
  toDate: string;
  label: string;
  preset: PresetId | "custom";
};

const DIA_MS = 24 * 60 * 60 * 1000;

/** Cota inferior del preset histórico. Anterior a cualquier escucha posible. */
const INICIO_DE_LOS_TIEMPOS = "1970-01-01";

export const PRESETS: Record<PresetId, { label: string; days: number | null }> = {
  "4w": { label: "Últimas 4 semanas", days: 27 },
  "6m": { label: "Últimos 6 meses", days: 181 },
  year: { label: "Último año", days: 364 },
  all: { label: "Histórico", days: null },
};

const PRESET_POR_DEFECTO: PresetId = "4w";

export type RangeParams = {
  preset?: string;
  desde?: string;
  hasta?: string;
};

/**
 * Valida 'YYYY-MM-DD', incluyendo que la fecha exista en el calendario.
 *
 * La comprobación de ida y vuelta es imprescindible: `Date.UTC(2019, 1, 30)` no
 * devuelve `NaN`, desborda silenciosamente al 2 de marzo. Sin ella, un rango
 * mostraría una etiqueta que no corresponde con los datos consultados.
 */
function diaValido(valor: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
  if (!m) return null;

  const [, y, mes, d] = m;
  const v = new Date(Date.UTC(Number(y), Number(mes) - 1, Number(d)));

  if (
    v.getUTCFullYear() !== Number(y) ||
    v.getUTCMonth() !== Number(mes) - 1 ||
    v.getUTCDate() !== Number(d)
  ) {
    return null;
  }

  return `${y}-${mes}-${d}`;
}

/**
 * Resta días a una fecha 'YYYY-MM-DD' devolviendo otra fecha 'YYYY-MM-DD'.
 *
 * Opera sobre la fecha de calendario, no sobre un instante, así que el horario
 * de verano no interviene: un día de calendario siempre son 24 h en esta
 * aritmética porque no hay zona horaria de por medio. Restar milisegundos al
 * instante y convertir después desplaza el resultado un día cuando la resta
 * cruza un cambio de hora.
 */
function restarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const v = new Date(Date.UTC(y, m - 1, d) - dias * DIA_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
}

function desdePreset(
  preset: PresetId,
  ahora: number,
  timeZone: string,
): StatsRange {
  const { label, days } = PRESETS[preset];
  // Primero se pasa a día local, y solo después se restan días de calendario.
  const toDate = localParts(ahora, timeZone).localDate;

  return {
    fromDate: days === null ? INICIO_DE_LOS_TIEMPOS : restarDias(toDate, days),
    toDate,
    label,
    preset,
  };
}

/**
 * Un rango explícito (ambas fechas válidas) tiene prioridad sobre el preset.
 * Cualquier entrada inválida cae al preset por defecto en vez de lanzar: estos
 * valores vienen de la URL y el usuario puede escribir cualquier cosa.
 */
export function parseRange(
  params: RangeParams,
  ahora: number,
  timeZone: string,
): StatsRange {
  if (params.desde && params.hasta) {
    const a = diaValido(params.desde);
    const b = diaValido(params.hasta);

    if (a !== null && b !== null) {
      const fromDate = a <= b ? a : b;
      const toDate = a <= b ? b : a;
      return {
        fromDate,
        toDate,
        // La etiqueta refleja el rango ya normalizado, no la entrada cruda:
        // mostrar lo que el usuario tecleó cuando difiere de lo consultado es
        // precisamente el fallo que esta reescritura elimina.
        label: `${fromDate} → ${toDate}`,
        preset: "custom",
      };
    }
  }

  const preset = params.preset;
  // `hasOwnProperty` y no `in`: `in` recorre la cadena de prototipos, así que
  // `?preset=constructor` pasaba el filtro y `PRESETS[preset]` resolvía a
  // `Object`, produciendo un rango con `label: undefined`.
  if (preset && Object.prototype.hasOwnProperty.call(PRESETS, preset)) {
    return desdePreset(preset as PresetId, ahora, timeZone);
  }

  return desdePreset(PRESET_POR_DEFECTO, ahora, timeZone);
}

/**
 * El periodo de igual duración justo antes del rango.
 *
 * Sirve para decir qué sube y qué baja. Devuelve null en «Histórico»: su inicio
 * es un centinela de 1970 y no hay nada anterior con lo que comparar; inventar
 * un periodo previo daría deltas contra el vacío que se leerían como
 * crecimientos espectaculares.
 */
export function rangoAnterior(range: StatsRange): StatsRange | null {
  if (range.preset === "all") return null;

  const dias = diasEntre(range.fromDate, range.toDate);
  if (dias <= 0) return null;

  return {
    fromDate: restarDias(range.fromDate, dias),
    // Un día antes del inicio del actual: si no, los dos periodos comparten el
    // primer día y el mismo dato contaría en los dos lados de la comparación.
    toDate: restarDias(range.fromDate, 1),
    label: "periodo anterior",
    preset: range.preset,
  };
}

/** Días de calendario entre dos fechas, ambas incluidas. */
function diasEntre(desde: string, hasta: string): number {
  const a = desde.split("-").map(Number);
  const b = hasta.split("-").map(Number);
  const ms =
    Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2]);
  return Math.round(ms / DIA_MS) + 1;
}
