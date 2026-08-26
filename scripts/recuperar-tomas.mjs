/**
 * Rescata las tomas del ranking que quedaron en la base del proyecto viejo.
 *
 * Al separar los dos proyectos, las escuchas se fusionaron pero las tomas de
 * `top_snapshots` no. Son fotos del top de Spotify en un instante y no se
 * pueden recrear: Spotify no deja volver atrás. La base viva tiene un hueco de
 * once días en la evolución del ranking y el archivo viejo tapa ocho.
 *
 * Solo inserta. Nunca borra ni actualiza una toma existente, y no toca el
 * archivo de origen, que se abre en solo lectura.
 *
 *   node scripts/recuperar-tomas.mjs             ensaya y cuenta
 *   node scripts/recuperar-tomas.mjs --aplicar   escribe
 *
 * YA APLICADO el 26 de agosto de 2026: 54 tomas recuperadas. El archivo de
 * origen se borro despues, asi que hoy esto falla al abrirlo. Se conserva
 * porque documenta de donde salieron esas tomas y como se comprobaron, y
 * porque sirve para el mismo caso con otro `ORIGEN`.
 */
import Database from "better-sqlite3";
import path from "node:path";

const ORIGEN = process.env.ORIGEN ?? "C:/PROYECTO JUAMPI/data/juampi.db";
const DESTINO = path.join(process.cwd(), "data", "ledger.db");
const aplicar = process.argv.includes("--aplicar");

const dia = (ts) => new Date(ts).toISOString().slice(0, 16).replace("T", " ");

const origen = new Database(ORIGEN, { readonly: true, fileMustExist: true });
const tomas = origen
  .prepare("SELECT taken_at, time_range, entity, payload_json FROM top_snapshots ORDER BY taken_at")
  .all();
origen.close();

const destino = new Database(DESTINO, { readonly: !aplicar, fileMustExist: true });
destino.pragma("busy_timeout = 5000");

const yaEsta = destino.prepare(
  "SELECT 1 FROM top_snapshots WHERE taken_at = ? AND entity = ? AND time_range = ?",
);
const insertar = destino.prepare(
  "INSERT INTO top_snapshots (taken_at, time_range, entity, payload_json) VALUES (?, ?, ?, ?)",
);

const faltan = tomas.filter((t) => !yaEsta.get(t.taken_at, t.entity, t.time_range));

// El payload viaja como texto y aqui se guarda igual, pero si el proyecto
// viejo hubiera cambiado de forma, la evolucion leeria basura sin quejarse.
const rotas = faltan.filter((t) => {
  try {
    const p = JSON.parse(t.payload_json);
    return !Array.isArray(p?.items ?? p);
  } catch {
    return true;
  }
});

console.log(`origen : ${ORIGEN}`);
console.log(`destino: ${DESTINO}`);
console.log(`tomas en el origen: ${tomas.length}`);
console.log(`ya presentes      : ${tomas.length - faltan.length}`);
console.log(`a insertar        : ${faltan.length}`);
if (rotas.length) {
  console.error(`\nABORTA: ${rotas.length} tomas con un payload que no se entiende.`);
  process.exit(1);
}

const dias = [...new Set(faltan.map((t) => dia(t.taken_at).slice(0, 10)))];
console.log(`dias que se recuperan (${dias.length}): ${dias.join("  ")}`);

if (!aplicar) {
  destino.close();
  console.log("\nEnsayo. Nada escrito. Repite con --aplicar.");
  process.exit(0);
}

const tx = destino.transaction((filas) => {
  for (const t of filas) insertar.run(t.taken_at, t.time_range, t.entity, t.payload_json);
});
tx(faltan);

const total = destino.prepare("SELECT COUNT(*) n FROM top_snapshots").get().n;
destino.close();
console.log(`\nInsertadas ${faltan.length}. La base tiene ahora ${total} tomas.`);
