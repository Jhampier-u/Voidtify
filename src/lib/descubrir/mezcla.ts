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
};

/**
 * Combina las respuestas de varias semillas en una lista ordenada.
 *
 * `conocidas` y `artistasConocidos` son claves normalizadas de tu historial.
 * Lo ya escuchado se descarta: recomendarte lo que llevas años oyendo no es
 * descubrir nada, y es justo lo que haría un motor que solo mirase parecido.
 */
export function mezclar(
  porSemilla: SimilarEntrada[][],
  conocidas: ReadonlySet<string>,
  artistasConocidos: ReadonlySet<string>,
  limite: number,
): Candidato[] {
  const acumulado = new Map<string, Candidato>();

  for (const lista of porSemilla) {
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
      } else {
        acumulado.set(clave, {
          clave,
          artistaClave: aClave,
          artista,
          titulo,
          puntos: e.match,
          semillas: 1,
          artistaConocido: artistasConocidos.has(aClave),
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
