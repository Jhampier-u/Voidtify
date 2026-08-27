/**
 * Recalcula `ms_played` de las escuchas capturadas en vivo.
 *
 * La captura guardaba la duración entera de la canción, como si siempre sonara
 * completa. Sobre estos datos eso infla el tiempo un 17 % frente a como lo mide
 * el volcado de Spotify, que sí registra lo que sonó de verdad.
 *
 * `played_at` es el **final** de la reproducción. Se comprobó contra el
 * volcado, donde `ms_played` es real: el hueco entre dos marcas coincide con lo
 * que sonó la **segunda** en el 85 % de los casos y con lo que sonó la primera
 * solo en el 13 %. Así que el hueco desde la escucha anterior acota esta.
 *
 * Solo toca filas con `source = 'live'`. Las del volcado ya traen el dato bueno.
 *
 * Es idempotente: el nuevo valor es `min(hueco, actual)` y el hueco no cambia,
 * así que volver a ejecutarlo da lo mismo.
 *
 *   node scripts/recalcular-tiempo.mjs             ensaya y cuenta
 *   node scripts/recalcular-tiempo.mjs --aplicar   escribe
 */
import Database from "better-sqlite3";
import path from "node:path";

const DESTINO = path.join(process.cwd(), "data", "ledger.db");
const aplicar = process.argv.includes("--aplicar");

/** Por encima de esto el hueco no mide una reproducción, mide una pausa. */
const MAX_HUECO_MS = 30 * 60_000;

const horas = (ms) => (ms / 3_600_000).toFixed(1);

const db = new Database(DESTINO, { readonly: !aplicar, fileMustExist: true });
db.pragma("busy_timeout = 5000");

const filas = db
  .prepare(
    "SELECT id, ts, ms_played FROM streams WHERE source = 'live' ORDER BY ts",
  )
  .all();

if (filas.length === 0) {
  console.log("No hay escuchas capturadas en vivo.");
  process.exit(0);
}

const cambios = [];
let previo = null;
let antes = 0;
let despues = 0;
let bajanDelUmbral = 0;

for (const f of filas) {
  const hueco = previo === null ? null : f.ts - previo;
  previo = f.ts;

  antes += f.ms_played;

  if (hueco === null || hueco <= 0 || hueco > MAX_HUECO_MS) {
    despues += f.ms_played;
    continue;
  }

  const nuevo = Math.min(hueco, f.ms_played);
  despues += nuevo;
  if (nuevo === f.ms_played) continue;

  if (f.ms_played >= 30_000 && nuevo < 30_000) bajanDelUmbral += 1;
  cambios.push({ id: f.id, nuevo });
}

console.log(`base    : ${DESTINO}`);
console.log(`en vivo : ${filas.length.toLocaleString("es")} escuchas`);
console.log(`a cambiar: ${cambios.length.toLocaleString("es")}`);
console.log(`tiempo antes  : ${horas(antes)} h`);
console.log(`tiempo después: ${horas(despues)} h`);
console.log(
  `diferencia    : ${horas(antes - despues)} h ` +
    `(${(((antes - despues) / antes) * 100).toFixed(1)} % menos)`,
);
// El umbral de treinta segundos decide qué cuenta como reproducción: si alguna
// lo cruza hacia abajo, los recuentos de la aplicación cambian también.
console.log(`dejan de contar como reproducción: ${bajanDelUmbral}`);

if (!aplicar) {
  db.close();
  console.log("\nEnsayo. Nada escrito. Repite con --aplicar.");
  process.exit(0);
}

const actualizar = db.prepare("UPDATE streams SET ms_played = ? WHERE id = ?");
const tx = db.transaction((lista) => {
  for (const c of lista) actualizar.run(c.nuevo, c.id);
});
tx(cambios);

const total = db
  .prepare("SELECT SUM(ms_played) t FROM streams WHERE source = 'live'")
  .get().t;
db.close();
console.log(`\nActualizadas ${cambios.length}. En vivo suman ahora ${horas(total)} h.`);
