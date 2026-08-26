import "server-only";
import fs from "node:fs";
import path from "node:path";

export type EstadoCopias = {
  carpeta: string;
  /** Null si la carpeta no existe todavía. */
  ultima: { nombre: string; fecha: string; mb: number } | null;
  cuantas: number;
  /** Días desde la última copia, o null si no hay ninguna. */
  diasDesde: number | null;
};

/** `ledger-2026-08-25.db.gz` */
const PATRON = /^ledger-(\d{4}-\d{2}-\d{2})\.db\.gz$/;

/**
 * Estado de las copias de seguridad, leído de la carpeta destino.
 *
 * Se mira el disco y no un registro propio a propósito: lo que importa no es
 * que el script diga que copió, sino que el archivo esté ahí. Un registro puede
 * mentir sobre un fichero que alguien movió o que la nube no llegó a sincronizar.
 */
export function getEstadoCopias(ahoraMs: number): EstadoCopias {
  const carpeta =
    process.env.BACKUP_DIR ??
    path.join(
      process.env.USERPROFILE ?? process.env.HOME ?? ".",
      "OneDrive",
      "Voidtify-copias",
    );

  let nombres: string[] = [];
  try {
    nombres = fs.readdirSync(carpeta);
  } catch {
    // La carpeta no existe: aún no ha corrido ninguna copia.
    return { carpeta, ultima: null, cuantas: 0, diasDesde: null };
  }

  const copias = nombres.filter((n) => PATRON.test(n)).sort();
  const nombre = copias[copias.length - 1];
  if (!nombre) return { carpeta, ultima: null, cuantas: 0, diasDesde: null };

  const fecha = nombre.match(PATRON)![1];
  let mb = 0;
  try {
    mb = fs.statSync(path.join(carpeta, nombre)).size / 1048576;
  } catch {
    // El nombre está pero el archivo no se puede leer; se informa igual.
  }

  const [a, m, d] = fecha.split("-").map(Number);
  const dias = Math.floor((ahoraMs - Date.UTC(a, m - 1, d)) / 86_400_000);

  return {
    carpeta,
    ultima: { nombre, fecha, mb: Math.round(mb) },
    cuantas: copias.length,
    diasDesde: Math.max(0, dias),
  };
}
