/**
 * Qué copias de seguridad sobran.
 *
 * Va en un módulo aparte, puro y sin tocar disco, porque es la única parte de
 * todo esto que borra archivos: un fallo aquí no rompe nada visible, se lleva
 * las copias en silencio y no se descubre hasta el día que hacen falta.
 *
 * En `.mjs` y no en TypeScript para que lo puedan importar tanto el script de
 * copia —que corre con `node` a secas, sin compilar— como los tests.
 */

/** `ledger-2026-08-25.db.gz` */
const PATRON = /^ledger-(\d{4})-(\d{2})-(\d{2})\.db\.gz$/;

export const DIARIAS = 14;
export const MENSUALES = 12;

/**
 * Nombres a borrar, dado el contenido de la carpeta.
 *
 * Se conservan las `diarias` más recientes y, de las que caen fuera, las
 * hechas el día 1 de cada mes hasta un tope de `mensuales`. Así una semana
 * mala se puede deshacer con detalle y un error de hace medio año sigue
 * teniendo desde dónde recuperarse.
 *
 * Lo que no encaje en el patrón de nombre no se toca **nunca**. La carpeta
 * puede contener cualquier otra cosa, y borrar por descarte convertiría este
 * script en una trituradora de lo que no entiende.
 */
export function aBorrar(nombres, { diarias = DIARIAS, mensuales = MENSUALES } = {}) {
  const copias = nombres
    .filter((n) => PATRON.test(n))
    // Descendente: el nombre lleva la fecha en formato que ordena solo.
    .sort((a, b) => b.localeCompare(a));

  const conservar = new Set(copias.slice(0, diarias));

  let guardadas = 0;
  for (const n of copias.slice(diarias)) {
    if (guardadas >= mensuales) break;
    const [, , , dia] = n.match(PATRON);
    if (dia === "01") {
      conservar.add(n);
      guardadas += 1;
    }
  }

  return copias.filter((n) => !conservar.has(n));
}
