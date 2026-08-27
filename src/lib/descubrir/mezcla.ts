import { artistKey, trackKey } from "@/lib/stats/normalize";

/**
 * Una sugerencia tal como la devuelve Last.fm, ya extraída del JSON.
 *
 * Módulo puro: no habla con la red ni con la base. La mezcla es donde están
 * las decisiones que importan —qué se descarta, qué pesa más, cómo se
 * desempata— y tenerla aparte permite probarlas sin inventar respuestas HTTP.
 */
export type SimilarEntrada = {
  artista: string;
  titulo: string;
  /** Parecido con la semilla, entre 0 y 1. */
  match: number;
};

/** Una respuesta de Last.fm junto con de dónde salió, para poder explicarla. */
export type Rama = {
  /** Lo que se enseña: «Duster», «shoegaze», «Alison — Slowdive». */
  origen: string;
  entradas: SimilarEntrada[];
};

export type Candidato = {
  clave: string;
  artistaClave: string;
  artista: string;
  titulo: string;
  /** Suma de parecidos: salir cerca de varias semillas pesa más que de una. */
  puntos: number;
  /** Cuántas semillas lo trajeron. */
  semillas: number;
  /**
   * Si ya escuchas a ese artista, aunque no esta canción. Sirve para separar
   * «un tema que se te escapó» de «alguien a quien no conoces», que son dos
   * clases de descubrimiento distintas.
   */
  artistaConocido: boolean;
  /**
   * De qué semilla salió con más fuerza.
   *
   * Es la diferencia entre una lista de nombres y una recomendación: sin decir
   * «por Duster», quien mira no tiene forma de juzgar si tiene sentido.
   */
  desde: string;
};

/**
 * Combina las respuestas de varias semillas en una lista ordenada.
 *
 * `conocidas` y `artistasConocidos` son claves normalizadas de tu historial.
 * Lo ya escuchado se descarta: recomendarte lo que llevas años oyendo no es
 * descubrir nada, y es justo lo que haría un motor que solo mirase parecido.
 */
export function mezclar(
  ramas: Rama[],
  conocidas: ReadonlySet<string>,
  artistasConocidos: ReadonlySet<string>,
  limite: number,
): Candidato[] {
  const acumulado = new Map<string, Candidato>();
  /** El mejor parecido visto por candidato, para saber quién lo trajo. */
  const mejor = new Map<string, number>();

  for (const { origen, entradas: lista } of ramas) {
    // Una misma semilla puede repetir una canción en su respuesta; contarla dos
    // veces la subiría sin que haya más evidencia de la que hay.
    const vistasEnEstaSemilla = new Set<string>();

    for (const e of lista) {
      const artista = e.artista?.trim();
      const titulo = e.titulo?.trim();
      if (!artista || !titulo) continue;
      if (!Number.isFinite(e.match)) continue;

      const clave = trackKey(artista, titulo);
      if (conocidas.has(clave)) continue;
      if (vistasEnEstaSemilla.has(clave)) continue;
      vistasEnEstaSemilla.add(clave);

      const aClave = artistKey(artista);
      const previo = acumulado.get(clave);

      if (previo) {
        previo.puntos += e.match;
        previo.semillas += 1;
        // Se atribuye a la semilla que más se le parece, no a la primera que
        // lo trajo: con doce semillas, la primera es casi siempre la del
        // recorrido y no la que lo explica.
        if (e.match > (mejor.get(clave) ?? -1)) {
          mejor.set(clave, e.match);
          previo.desde = origen;
        }
      } else {
        mejor.set(clave, e.match);
        acumulado.set(clave, {
          clave,
          artistaClave: aClave,
          artista,
          titulo,
          puntos: e.match,
          semillas: 1,
          artistaConocido: artistasConocidos.has(aClave),
          desde: origen,
        });
      }
    }
  }

  // El desempate por clave no es decorativo: sin él, dos candidatos con el
  // mismo parecido saldrían en un orden u otro según el recorrido del Map, y
  // la lista cambiaría entre recargas sin que cambien los datos.
  return [...acumulado.values()]
    .sort(
      (a, b) =>
        b.puntos - a.puntos ||
        b.semillas - a.semillas ||
        a.clave.localeCompare(b.clave),
    )
    .slice(0, limite);
}
