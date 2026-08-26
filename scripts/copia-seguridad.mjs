/**
 * Copia de seguridad diaria de la base de escuchas.
 *
 * Corre con `node` a secas, sin el servidor por medio: si esto dependiera de
 * que la app esté levantada, dejaría de haber copias justo los días en que el
 * equipo va mal, que son los días en que hacen falta.
 *
 *   node scripts/copia-seguridad.mjs
 *
 * Destino: `BACKUP_DIR` si está definida; si no, la carpeta de OneDrive del
 * usuario. Que se replique fuera del equipo es lo único que protege de un
 * disco que falla; una copia en el mismo disco solo protege de un borrado.
 */

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pipeline } from "node:stream/promises";
import { aBorrar } from "./rotacion.mjs";

const RAIZ = path.join(import.meta.dirname, "..");
const ORIGEN = path.join(RAIZ, "data", "ledger.db");
const REGISTRO = path.join(RAIZ, "data", "copias.log");

function destino() {
  if (process.env.BACKUP_DIR) return process.env.BACKUP_DIR;
  const perfil = process.env.USERPROFILE ?? process.env.HOME ?? ".";
  return path.join(perfil, "OneDrive", "Voidtify-copias");
}

/**
 * Fecha local en `YYYY-MM-DD`.
 *
 * `toISOString` da UTC, y en Ecuador cualquier copia posterior a las siete de
 * la tarde quedaría fechada al día siguiente: dos copias compartirían nombre y
 * una pisaría a la otra. El locale sueco formatea justo así.
 */
function hoy() {
  const s = new Date().toLocaleDateString("sv");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`fecha local con formato inesperado: ${s}`);
  }
  return s;
}

function anotar(linea) {
  const texto = `[${new Date().toLocaleString("sv")}] ${linea}\n`;
  process.stdout.write(texto);
  try {
    fs.appendFileSync(REGISTRO, texto);
  } catch {
    // Si no se puede escribir el registro, la copia sigue siendo lo importante.
  }
}

async function main() {
  if (!fs.existsSync(ORIGEN)) {
    anotar(`ERROR: no existe ${ORIGEN}`);
    process.exit(1);
  }

  const carpeta = destino();
  fs.mkdirSync(carpeta, { recursive: true });

  const fecha = hoy();
  const crudo = path.join(carpeta, `.ledger-${fecha}.db.tmp`);
  const parcial = path.join(carpeta, `.ledger-${fecha}.db.gz.part`);
  const final = path.join(carpeta, `ledger-${fecha}.db.gz`);

  // Restos de un intento anterior que se cortó a medias.
  for (const f of [crudo, parcial]) if (fs.existsSync(f)) fs.rmSync(f);

  let filasOrigen = 0;
  try {
    // VACUUM INTO y no copiar el archivo: la base está en modo WAL y en uso.
    // Copiarla a pelo se lleva un `.db` sin los cambios que aún viven en el
    // `-wal`, es decir una copia silenciosamente incompleta.
    const origen = new Database(ORIGEN, { readonly: true });
    filasOrigen = origen.prepare("SELECT COUNT(*) c FROM streams").get().c;
    origen.prepare("VACUUM INTO ?").run(crudo);
    origen.close();
  } catch (e) {
    anotar(`ERROR al volcar: ${e.message}`);
    process.exit(1);
  }

  // Fuera las credenciales antes de que esto salga del equipo.
  //
  // La copia acaba replicada en la nube, y `spotify_credentials` guarda el
  // `refresh_token`: con el, y con el client_secret, se entra en la cuenta.
  // Perderlo al restaurar cuesta un inicio de sesion; tenerlo ahi arriba no
  // aporta nada a cambio.
  try {
    const limpiando = new Database(crudo);
    limpiando.prepare("DELETE FROM spotify_credentials").run();
    limpiando.close();
  } catch (e) {
    anotar(`ERROR al retirar las credenciales: ${e.message}. No se guarda la copia.`);
    fs.rmSync(crudo, { force: true });
    process.exit(1);
  }

  // Una copia que nunca se ha abierto no es una copia, es un archivo grande.
  // Se comprueba aquí, mientras aún se puede repetir, y no el día que haga
  // falta restaurarla.
  try {
    const copia = new Database(crudo, { readonly: true });
    const filas = copia.prepare("SELECT COUNT(*) c FROM streams").get().c;
    const credenciales = copia
      .prepare("SELECT COUNT(*) c FROM spotify_credentials")
      .get().c;
    const integridad = copia.pragma("integrity_check", { simple: true });
    copia.close();

    if (integridad !== "ok") throw new Error(`integrity_check dijo ${integridad}`);
    if (credenciales !== 0) throw new Error("las credenciales siguen dentro");
    if (filas !== filasOrigen) {
      throw new Error(`tiene ${filas} escuchas y el original ${filasOrigen}`);
    }
  } catch (e) {
    anotar(`ERROR: la copia no supera la verificacion (${e.message}). No se rota.`);
    fs.rmSync(crudo, { force: true });
    process.exit(1);
  }

  await pipeline(
    fs.createReadStream(crudo),
    zlib.createGzip({ level: 6 }),
    fs.createWriteStream(parcial),
  );
  fs.rmSync(crudo);

  // Se renombra al final para que nunca exista un `ledger-*.db.gz` a medias:
  // la rotación cuenta archivos por su nombre y uno truncado contaria como
  // copia buena.
  fs.renameSync(parcial, final);

  const mb = (fs.statSync(final).size / 1048576).toFixed(0);
  anotar(`copia ${path.basename(final)} · ${filasOrigen.toLocaleString("es")} escuchas · ${mb} MB`);

  // Rotar solo despues de tener la copia nueva verificada en su sitio.
  const sobran = aBorrar(fs.readdirSync(carpeta));
  for (const n of sobran) {
    fs.rmSync(path.join(carpeta, n), { force: true });
  }
  if (sobran.length > 0) anotar(`retiradas ${sobran.length} copias antiguas`);
}

main().catch((e) => {
  anotar(`ERROR inesperado: ${e.stack ?? e.message}`);
  process.exit(1);
});
