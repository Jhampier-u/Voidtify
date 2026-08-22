/**
 * Identificadores de periodo y comparación de rankings.
 *
 * Módulo puro. La aritmética de calendario y las reglas de qué cuenta como
 * «entra», «sale» o «sube» son donde se cometen los errores silenciosos, así
 * que viven separadas de la base para poder probarlas.
 */

export type TipoPeriodo = "semana" | "mes" | "anio";

/**
 * Una semana se identifica por la fecha de su lunes, no por un número de
 * semana. Los números arrastran las reglas de la semana 1, que difieren entre
 * ISO y `strftime`, y encima no ordenan bien a caballo entre años. Un lunes es
 * una fecha: ordena sola y no admite interpretación.
 */
export type Periodo = string;

const DIA = 86_400_000;

/** Fecha local `YYYY-MM-DD` a epoch UTC de medianoche, sin desfases. */
function aUTC(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

function aTexto(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Lunes de la semana que contiene esa fecha. */
export function lunesDe(fecha: string): string {
  const ms = aUTC(fecha);
  // getUTCDay: domingo 0 … sábado 6. Se quiere lunes como primer día.
  const dia = (new Date(ms).getUTCDay() + 6) % 7;
  return aTexto(ms - dia * DIA);
}

export function periodoDe(fecha: string, tipo: TipoPeriodo): Periodo {
  if (tipo === "semana") return lunesDe(fecha);
  if (tipo === "mes") return fecha.slice(0, 7);
  return fecha.slice(0, 4);
}

/** El periodo inmediatamente anterior. */
export function anterior(periodo: Periodo, tipo: TipoPeriodo): Periodo {
  if (tipo === "semana") return aTexto(aUTC(periodo) - 7 * DIA);
  if (tipo === "anio") return String(Number(periodo) - 1);

  const [a, m] = periodo.split("-").map(Number);
  // Enero retrocede a diciembre del año anterior; sin esto saldría el mes 0.
  return m === 1
    ? `${a - 1}-12`
    : `${a}-${String(m - 1).padStart(2, "0")}`;
}

/** Primer y último día del periodo, para filtrar por `local_date`. */
export function limites(periodo: Periodo, tipo: TipoPeriodo): {
  desde: string;
  hasta: string;
} {
  if (tipo === "semana") {
    return { desde: periodo, hasta: aTexto(aUTC(periodo) + 6 * DIA) };
  }
  if (tipo === "anio") return { desde: `${periodo}-01-01`, hasta: `${periodo}-12-31` };

  const [a, m] = periodo.split("-").map(Number);
  // Día 0 del mes siguiente es el último del actual, y así no hay que saberse
  // los días de cada mes ni los años bisiestos.
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: `${periodo}-01`, hasta: `${periodo}-${String(ultimo).padStart(2, "0")}` };
}

// ---------------------------------------------------------------------------

export type EntradaRanking = { key: string; name: string; plays: number };

export type Movimiento = "nuevo" | "sube" | "baja" | "igual";

export type FilaComparada = EntradaRanking & {
  posicion: number;
  /** Posición en el periodo anterior, o null si no estaba. */
  posicionAnterior: number | null;
  /** Puestos ganados; positivo sube. Null si es nuevo. */
  delta: number | null;
  movimiento: Movimiento;
  playsAnterior: number | null;
};

export type Comparacion = {
  filas: FilaComparada[];
  /** Estaban en el ranking anterior y ya no aparecen. */
  salen: (EntradaRanking & { posicionAnterior: number })[];
};

/**
 * Cruza dos rankings ya ordenados.
 *
 * «Nuevo» significa que no estaba en la lista anterior, no que no se hubiera
 * escuchado nunca: comparar dos top 20 solo puede hablar de esos veinte. La
 * interfaz debe decirlo así para no prometer más de lo que sabe.
 */
export function compararRanking(
  actual: EntradaRanking[],
  previo: EntradaRanking[],
): Comparacion {
  const antes = new Map(previo.map((e, i) => [e.key, { e, pos: i + 1 }]));

  const filas: FilaComparada[] = actual.map((e, i) => {
    const posicion = i + 1;
    const p = antes.get(e.key);
    if (!p) {
      return {
        ...e,
        posicion,
        posicionAnterior: null,
        delta: null,
        movimiento: "nuevo",
        playsAnterior: null,
      };
    }
    const delta = p.pos - posicion;
    return {
      ...e,
      posicion,
      posicionAnterior: p.pos,
      delta,
      movimiento: delta > 0 ? "sube" : delta < 0 ? "baja" : "igual",
      playsAnterior: p.e.plays,
    };
  });

  const presentes = new Set(actual.map((e) => e.key));
  const salen = previo
    .map((e, i) => ({ ...e, posicionAnterior: i + 1 }))
    .filter((e) => !presentes.has(e.key));

  return { filas, salen };
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Nombre legible del periodo.
 *
 * Los meses salen de una tabla propia y no de `toLocaleDateString`, porque
 * construir una fecha desde `YYYY-MM` y formatearla arrastra la zona horaria
 * del proceso: en cualquier zona al oeste de Greenwich, la medianoche del día
 * uno cae en el mes anterior y agosto aparecería como julio.
 */
export function etiqueta(periodo: Periodo, tipo: TipoPeriodo): string {
  if (tipo === "anio") return periodo;

  if (tipo === "mes") {
    const [a, m] = periodo.split("-").map(Number);
    return `${MESES[m - 1]} de ${a}`;
  }

  const [a, m, d] = periodo.split("-").map(Number);
  return `semana del ${d} de ${MESES[m - 1]} de ${a}`;
}
