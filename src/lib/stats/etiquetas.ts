/**
 * A qué eje pertenece cada etiqueta de Last.fm.
 *
 * Las etiquetas no son un vocabulario de géneros: son lo que la gente escribe.
 * En este archivo hay 1.488 distintas y una de cada ocho apariciones no es un
 * género, sino una década, un país, un tipo de voz o una colección personal.
 * Mezcladas en la misma lista, «female vocalists» le quita el puesto ocho a un
 * género de verdad.
 *
 * Separarlas no es limpieza: son tres lecturas más con los mismos datos.
 *
 * Módulo puro y con listas explícitas, no con heurísticas. Adivinar el eje por
 * la forma de la palabra fallaría justo donde importa: «rock argentino»,
 * «j-pop» y «latin pop» llevan un origen dentro y son géneros; «argentina» y
 * «japanese» a secas, no.
 */

export type Eje = "genero" | "epoca" | "procedencia" | "voz" | "otros";

/** `80s`, `90s`, `1980s`, `2000s`. */
const DECADA = /^(19|20)?[0-9]0s$/;

/** Etiquetas de época que no son una década escrita en cifras. */
const EPOCA = new Set(["oldies", "old school", "classic", "vintage", "retro"]);

/**
 * País, gentilicio o idioma a secas.
 *
 * Solo la palabra sola. Cualquier etiqueta que combine origen y género —«rock
 * en espanol», «rock argentino», «j-pop», «latin pop»— es un género y no entra
 * aquí: dice cómo suena, no solo de dónde viene.
 */
const PROCEDENCIA = new Set([
  "american", "americana usa", "usa", "united states", "us",
  "british", "uk", "england", "english", "scottish", "welsh", "irish", "ireland",
  "japanese", "japan", "korean", "korea", "chinese", "china", "taiwanese",
  "spanish", "spain", "españa", "espanol", "español",
  "mexican", "mexico", "méxico", "argentina", "argentinian", "argentino",
  "chile", "chilean", "colombia", "colombian", "peru", "peruvian",
  "venezuela", "venezuelan", "ecuador", "ecuatoriano", "uruguay", "bolivia",
  "brazil", "brazilian", "brasil", "cuba", "cuban", "puerto rico",
  "canadian", "canada", "australian", "australia", "new zealand",
  "french", "france", "german", "germany", "deutsch",
  "italian", "italy", "swedish", "sweden", "norwegian", "norway",
  "finnish", "finland", "danish", "denmark", "icelandic", "iceland",
  "dutch", "netherlands", "belgian", "belgium", "swiss", "switzerland",
  "austrian", "austria", "polish", "poland", "czech", "hungarian", "romanian",
  "russian", "russia", "ukrainian", "ukraine", "portuguese", "portugal",
  "greek", "greece", "turkish", "turkey", "israeli", "israel",
  "indian", "india", "nigerian", "nigeria", "south africa", "south african",
  "latinoamerica", "latinoamérica", "latin america",
]);

/** Tipo de voz. Una descripción del intérprete, no del sonido. */
const VOZ = new Set([
  "female vocalists", "female vocalist", "female vocals", "female voice",
  "male vocalists", "male vocalist", "male vocals", "male voice",
  "female fronted", "male fronted", "female singers", "male singers",
]);

/**
 * Ni género ni eje: son notas de quien etiquetó.
 *
 * La lista es corta a propósito. Ante la duda una etiqueta se queda como
 * género: dejar una dudosa en la lista de géneros solo ensucia un puesto,
 * mientras que sacar una de verdad borra información sin avisar.
 */
const OTROS = new Set([
  "seen live", "my top songs", "my music", "favorites", "favourites",
  "favorite", "favourite", "cover", "covers", "awesome", "beautiful",
  "love", "loved", "cool", "the best", "best", "check out", "albums i own",
  "spotify", "under 2000 listeners", "under 500 listeners",
]);

/** Deja la etiqueta comparable: minúsculas y sin espacios de sobra. */
export function normalizarEtiqueta(tag: string): string {
  return tag.toLowerCase().trim().replace(/\s+/g, " ");
}

export function clasificar(tag: string): Eje {
  const t = normalizarEtiqueta(tag);
  if (t === "") return "otros";
  if (DECADA.test(t) || EPOCA.has(t)) return "epoca";
  if (PROCEDENCIA.has(t)) return "procedencia";
  if (VOZ.has(t)) return "voz";
  if (OTROS.has(t)) return "otros";
  return "genero";
}

/**
 * Reparte una lista de etiquetas por eje, conservando el orden.
 *
 * El orden importa: Last.fm las devuelve de más a menos usada, y el reparto de
 * géneros se queda solo con las primeras de cada artista.
 */
export function porEje(tags: string[]): Record<Eje, string[]> {
  const salida: Record<Eje, string[]> = {
    genero: [],
    epoca: [],
    procedencia: [],
    voz: [],
    otros: [],
  };

  const vistas = new Set<string>();
  for (const tag of tags) {
    const t = normalizarEtiqueta(tag);
    // Un artista puede traer «80s» y «80S»; contarlas dos veces inflaría su
    // peso en el reparto sin que nada lo delate.
    if (t === "" || vistas.has(t)) continue;
    vistas.add(t);
    salida[clasificar(t)].push(t);
  }

  return salida;
}
