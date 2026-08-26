/**
 * Serie temporal para el gráfico de evolución.
 *
 * Módulo puro: decide la granularidad y rellena los huecos. Vive aparte porque
 * las dos reglas se equivocan en silencio —una escala mal elegida y un hueco
 * omitido producen gráficos plausibles y falsos— y así se pueden probar.
 */

export type Granularidad = "dia" | "mes";

export type Punto = {
  /** `YYYY-MM-DD` o `YYYY-MM`, según la granularidad. */
  clave: string;
  etiqueta: string;
  plays: number;
};

export type Serie = {
  granularidad: Granularidad;
  puntos: Punto[];
};

const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

const DIA_MS = 86_400_000;

/**
 * A partir de cuántos meses distintos se dibuja por meses.
 *
 * Con menos, la línea degenera: en un rango de cuatro semanas hay dos meses, y
 * dos puntos unidos son un segmento recto que sugiere un crecimiento continuo
 * que nunca ocurrió. Por días, ese mismo rango enseña la forma real de cómo
 * escuchas.
 */
const MINIMO_MESES = 4;

function aUTC(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

function aTexto(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function etiquetaMes(clave: string): string {
  const [anio, mes] = clave.split("-");
  return `${MESES[Number(mes) - 1]} ${anio.slice(2)}`;
}

export function etiquetaDia(clave: string): string {
  const [, mes, dia] = clave.split("-");
  return `${Number(dia)} ${MESES[Number(mes) - 1]}`;
}

/**
 * Compone la serie a partir de los datos que la portada ya consulta.
 *
 * Los huecos se rellenan con cero. Omitirlos haría que dos días separados por
 * una semana de silencio salieran contiguos, y la línea uniría dos picos como
 * si no hubiera pasado nada entre medias: exactamente la lectura contraria a la
 * verdadera.
 */
export function construirSerie(
  dias: { date: string; plays: number }[],
  meses: { month: string; plays: number }[],
  desde: string,
  hasta: string,
): Serie {
  // Sin datos diarios no se puede dibujar por días aunque el rango sea corto:
  // la ficha de una canción solo trae su reparto por meses.
  if (meses.length >= MINIMO_MESES || (dias.length === 0 && meses.length > 0)) {
    return {
      granularidad: "mes",
      puntos: meses.map((m) => ({
        clave: m.month,
        etiqueta: etiquetaMes(m.month),
        plays: m.plays,
      })),
    };
  }

  const porDia = new Map(dias.map((d) => [d.date, d.plays]));
  const puntos: Punto[] = [];

  const fin = aUTC(hasta);
  for (let t = aUTC(desde); t <= fin; t += DIA_MS) {
    const clave = aTexto(t);
    puntos.push({
      clave,
      etiqueta: etiquetaDia(clave),
      plays: porDia.get(clave) ?? 0,
    });
  }

  return { granularidad: "dia", puntos };
}
