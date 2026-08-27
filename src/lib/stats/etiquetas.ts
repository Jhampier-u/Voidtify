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
  // Regiones, no países. Salen igual de la pregunta «de dónde viene».
  "asian", "asia", "european", "europe", "african", "africa",
  "scandinavian", "nordic", "middle east",
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
  // Una entrada suelta y no una regla: es un meme de JoJo que Last.fm cuela
  // como género y ya salía en la lista de dormidos. No hay patrón que lo
  // distinga de un género raro de verdad sin arriesgarse a borrar uno.
  "ora ora ora ora",
]);

/** Deja la etiqueta legible y comparable: minúsculas y sin espacios de sobra. */
export function normalizarEtiqueta(tag: string): string {
  return tag.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * La forma con la que se decide si dos etiquetas son la misma.
 *
 * Sin guiones ni espacios. La gente escribe `lo-fi`, `lo fi` y `lofi`, y
 * `hip-hop` y `hip hop` sumaban 142 y 78 por separado como si fueran dos
 * géneros distintos; peor aún, `lo-fi` salía entre lo que más escuchas y
 * `lo fi` entre lo que llevabas meses sin tocar.
 *
 * Solo se tocan el guion y el espacio. Quitar también el ampersand juntaría
 * `r&b` con `rb` sin acercarlo a `rnb`, que es lo que haría falta, y abriría la
 * puerta a fusiones que nadie ha comprobado.
 */
export function claveEtiqueta(tag: string): string {
  return normalizarEtiqueta(tag).replace(/[\s-]+/g, "");
}

const porClave = (conjunto: Set<string>) =>
  new Set([...conjunto].map(claveEtiqueta));

const PROCEDENCIA_K = porClave(PROCEDENCIA);
const VOZ_K = porClave(VOZ);
const OTROS_K = porClave(OTROS);
const EPOCA_K = porClave(EPOCA);

export function clasificar(tag: string): Eje {
  const t = normalizarEtiqueta(tag);
  if (t === "") return "otros";

  // Se mira también por clave para que `female-vocalists` caiga en el mismo eje
  // que `female vocalists` sin tener que listar cada variante.
  const k = claveEtiqueta(t);
  if (DECADA.test(t) || EPOCA.has(t) || EPOCA_K.has(k)) return "epoca";
  if (PROCEDENCIA.has(t) || PROCEDENCIA_K.has(k)) return "procedencia";
  if (VOZ.has(t) || VOZ_K.has(k)) return "voz";
  if (OTROS.has(t) || OTROS_K.has(k)) return "otros";
  return "genero";
}

export type Canon = {
  /** La clave con la que agrupar. */
  clave: (tag: string) => string;
  /** La ortografía que se enseña para esa clave. */
  nombre: (clave: string) => string;
};

/**
 * Decide con qué ortografía se enseña cada grupo de variantes.
 *
 * Gana la más frecuente en el vocabulario, que es la que la gente escribe de
 * verdad: sobre estos datos salen `lo-fi`, `hip-hop`, `post-punk` y
 * `dream pop`, que son además las correctas. El desempate es alfabético para
 * que dos ejecuciones den lo mismo; sin él, dos variantes empatadas se
 * turnarían entre recargas y la lista parecería cambiar sola.
 *
 * Se construye sobre el vocabulario entero y no sobre lo que entre en cada
 * pantalla: si cada sección eligiera su ortografía por su cuenta, el reparto
 * podría decir `lo-fi` y la mezcla `lo fi`, y dejarían de cruzarse.
 */
export function crearCanon(corpus: Iterable<Iterable<string>>): Canon {
  const variantes = new Map<string, Map<string, number>>();

  for (const tags of corpus) {
    for (const tag of tags) {
      const n = normalizarEtiqueta(tag);
      if (n === "") continue;
      const k = claveEtiqueta(n);
      const m = variantes.get(k) ?? new Map<string, number>();
      m.set(n, (m.get(n) ?? 0) + 1);
      variantes.set(k, m);
    }
  }

  const nombres = new Map<string, string>();
  for (const [k, m] of variantes) {
    const [mejor] = [...m.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    nombres.set(k, mejor[0]);
  }

  return {
    clave: claveEtiqueta,
    // Si la clave no estaba en el corpus se devuelve tal cual: es mejor enseñar
    // una ortografía sin pulir que una cadena vacía.
    nombre: (clave) => nombres.get(clave) ?? clave,
  };
}

/**
 * Reparte las etiquetas de un artista por eje, en claves y sin repetir.
 *
 * Devuelve **claves**, no la ortografía original: es lo que garantiza que
 * `lo-fi` y `lofi` sean el mismo género en todas las pantallas. Para enseñarlas
 * hay que pasarlas por `Canon.nombre`.
 *
 * El orden se conserva: Last.fm las devuelve de más a menos usada y el reparto
 * se queda solo con las primeras de cada artista.
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
    const k = claveEtiqueta(tag);
    // Se deduplica por clave y no por la forma escrita: un artista con «lo-fi»
    // y «lofi» inflaría su peso al contarse dos veces sin que nada lo delate.
    if (k === "" || vistas.has(k)) continue;
    vistas.add(k);
    salida[clasificar(tag)].push(k);
  }

  return salida;
}
