/**
 * Estructura del calendario: qué forma toma y qué hay en cada casilla.
 *
 * Módulo puro. La decisión de forma y el nivel de cada día se equivocan en
 * silencio —una rejilla desalineada por un día o una escala mal repartida
 * producen un calendario plausible y falso—, así que vive aparte y se prueba.
 */

export type Nivel = 0 | 1 | 2 | 3 | 4;

export type Celda = {
  /** `YYYY-MM-DD`. */
  fecha: string;
  diaDelMes: number;
  plays: number;
  ms: number;
  /** 0 es un día del rango sin música; null es un día fuera del rango. */
  nivel: Nivel;
  /**
   * Escuchas del día sobre las del mejor día, de 0 a 1.
   *
   * El nivel reparte en cinco cajones porque en un cuadrado de treinta píxeles
   * no se distingue más. La casilla grande sí admite la cifra exacta: se dibuja
   * como relleno y ahí un cajón de cinco tiraría a la basura la diferencia
   * entre un día flojo y uno normal.
   */
  ratio: number;
};

/** Un hueco de la rejilla: relleno de alineación o día fuera del rango. */
export type Hueco = null;

export type Mes = {
  /** `YYYY-MM`. */
  clave: string;
  titulo: string;
  /** En orden, de lunes a domingo, con huecos al principio para alinear. */
  celdas: (Celda | Hueco)[];
};

export type Anio = {
  anio: number;
  /** Semana a semana y dentro de cada una de lunes a domingo. */
  celdas: (Celda | Hueco)[];
  semanas: number;
};

export type Calendario =
  | {
      forma: "meses";
      /**
       * `rica` cabe con el número del día, las escuchas y una carátula dentro.
       * `compacta` solo con el número.
       */
      densidad: "rica" | "compacta";
      meses: Mes[];
    }
  | { forma: "tiras"; anios: Anio[] };

export type Bucket = { date: string; plays: number; ms: number };

const DIA_MS = 86_400_000;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Días de rango a partir de los cuales no caben meses de verdad.
 *
 * Doce meses son doce rejillas y todavía se leen. El histórico son casi cien y
 * no hay pantalla que los aguante: ahí manda la tira por año.
 */
export const MAX_DIAS_EN_MESES = 366;

/**
 * Días hasta los que la casilla puede llevar contenido dentro.
 *
 * Dos meses son a lo sumo diez columnas repartidas en dos bloques: la casilla
 * pasa de los cien píxeles y admite el número, la cifra y una carátula. A
 * partir de ahí encoge y solo cabe el número.
 */
export const MAX_DIAS_RICOS = 62;

export function aUTC(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

export function aTexto(ms: number): string {
  const v = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
}

/** Lunes = 0, que es como se lee un calendario aquí. */
export function diaSemana(ms: number): number {
  return (new Date(ms).getUTCDay() + 6) % 7;
}

/**
 * Reparte las escuchas de un día en cinco escalones.
 *
 * Cinco y no un degradado continuo: entre dos días que se diferencian en una
 * escucha el ojo no distingue nada, y la escala deja de significar. El cero
 * queda reservado a los días sin música, así que cualquier día con al menos una
 * escucha entra en el escalón uno aunque el máximo sea enorme.
 */
export function nivelDe(plays: number, max: number): Nivel {
  if (plays <= 0) return 0;
  if (max <= 0) return 1;
  const escalon = Math.ceil((Math.min(1, plays / max) * 4));
  return (Math.max(1, escalon) as Nivel);
}

function celdaDe(ms: number, porFecha: Map<string, Bucket>, max: number): Celda {
  const fecha = aTexto(ms);
  const b = porFecha.get(fecha);
  return {
    fecha,
    diaDelMes: new Date(ms).getUTCDate(),
    plays: b?.plays ?? 0,
    ms: b?.ms ?? 0,
    nivel: nivelDe(b?.plays ?? 0, max),
    ratio: max > 0 ? Math.min(1, (b?.plays ?? 0) / max) : 0,
  };
}

/**
 * El calendario que corresponde a un rango.
 *
 * Los meses se dibujan enteros aunque el rango empiece a mitad: un bloque que
 * arranca en el día 12 no se lee como agosto. Los días del mes que caen fuera
 * del rango van como hueco, que es distinto de un día sin música —uno no se
 * consultó y el otro sí, y no puede verse igual—.
 */
export function construirCalendario(
  buckets: Bucket[],
  /**
   * Primer día del rango, o null cuando el rango no tiene principio.
   *
   * El preset «Histórico» no tiene fecha de inicio: `range.fromDate` vale
   * 1970-01-01, y dibujarlo literalmente daría cincuenta y seis tiras por año
   * vacías antes de la primera escucha. Con null se empieza en el primer día
   * con datos.
   *
   * Es un argumento y no una deducción a partir de los datos: en un rango de
   * cuatro semanas que empieza en silencio, arrancar en el primer día con
   * música escondería justo los huecos que el calendario existe para enseñar.
   */
  desde: string | null,
  hasta: string,
): Calendario | null {
  if (buckets.length === 0) return null;

  const porFecha = new Map(buckets.map((b) => [b.date, b]));
  const max = Math.max(...buckets.map((b) => b.plays));

  const ini = aUTC(desde ?? buckets[0].date);
  const fin = aUTC(hasta);
  if (fin < ini) return null;

  const dias = Math.round((fin - ini) / DIA_MS) + 1;

  if (dias > MAX_DIAS_EN_MESES) {
    return { forma: "tiras", anios: construirTiras(ini, fin, porFecha, max) };
  }

  return {
    forma: "meses",
    densidad: dias <= MAX_DIAS_RICOS ? "rica" : "compacta",
    meses: construirMeses(ini, fin, porFecha, max),
  };
}

function construirMeses(
  ini: number,
  fin: number,
  porFecha: Map<string, Bucket>,
  max: number,
): Mes[] {
  const meses: Mes[] = [];

  const primerDiaDelMes = (ms: number) => {
    const v = new Date(ms);
    return Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), 1);
  };

  for (let m = primerDiaDelMes(ini); m <= fin; ) {
    const v = new Date(m);
    const anio = v.getUTCFullYear();
    const mes = v.getUTCMonth();
    const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();

    // Huecos hasta el primer día, para que el uno caiga bajo su día de semana.
    const celdas: (Celda | Hueco)[] = Array<Hueco>(diaSemana(m)).fill(null);

    for (let d = 1; d <= ultimo; d++) {
      const ms = Date.UTC(anio, mes, d);
      celdas.push(ms < ini || ms > fin ? null : celdaDe(ms, porFecha, max));
    }

    meses.push({
      clave: `${anio}-${String(mes + 1).padStart(2, "0")}`,
      titulo: `${MESES[mes]} ${anio}`,
      celdas,
    });

    m = Date.UTC(anio, mes + 1, 1);
  }

  return meses;
}

function construirTiras(
  ini: number,
  fin: number,
  porFecha: Map<string, Bucket>,
  max: number,
): Anio[] {
  const anios: Anio[] = [];
  const primero = new Date(ini).getUTCFullYear();
  const ultimo = new Date(fin).getUTCFullYear();

  // De más reciente a más antiguo: lo de este año es lo que se mira primero.
  for (let a = ultimo; a >= primero; a--) {
    const desde = Math.max(ini, Date.UTC(a, 0, 1));
    const hasta = Math.min(fin, Date.UTC(a, 11, 31));

    // La rejilla arranca en el lunes de la semana del primer día, para que
    // cada fila sea siempre el mismo día de la semana.
    const lunes = desde - diaSemana(desde) * DIA_MS;
    const semanas = Math.floor((hasta - lunes) / (7 * DIA_MS)) + 1;

    const celdas: (Celda | Hueco)[] = [];
    for (let s = 0; s < semanas; s++) {
      for (let d = 0; d < 7; d++) {
        const ms = lunes + (s * 7 + d) * DIA_MS;
        celdas.push(ms < desde || ms > hasta ? null : celdaDe(ms, porFecha, max));
      }
    }

    anios.push({ anio: a, celdas, semanas });
  }

  return anios;
}
