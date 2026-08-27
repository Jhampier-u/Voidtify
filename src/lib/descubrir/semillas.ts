import type { Rama } from "./mezcla";

/**
 * De dónde arranca el descubrimiento.
 *
 * Antes solo había una fuente posible: tus canciones más escuchadas del rango.
 * Eso responde a «qué más me gustaría», pero no a «quiero algo como esto de
 * aquí», que es la pregunta que uno se hace de verdad cuando descubre música.
 */
export type Semilla =
  | { tipo: "tops" }
  | { tipo: "artista"; nombre: string }
  | { tipo: "cancion"; artista: string; titulo: string }
  | { tipo: "album"; artista: string; titulo: string }
  | { tipo: "genero"; nombre: string }
  | { tipo: "playlist"; id: string; nombre: string };

export type TipoSemilla = Semilla["tipo"];

const TIPOS: TipoSemilla[] = [
  "tops",
  "artista",
  "cancion",
  "album",
  "genero",
  "playlist",
];

export function esTipoSemilla(v: string): v is TipoSemilla {
  return (TIPOS as string[]).includes(v);
}

/** Cómo se nombra la semilla en pantalla. */
export function etiquetaDeSemilla(s: Semilla): string {
  switch (s.tipo) {
    case "tops":
      return "lo que más escuchas";
    case "artista":
      return s.nombre;
    case "cancion":
      return `${s.titulo} — ${s.artista}`;
    case "album":
      return s.titulo;
    case "genero":
      return s.nombre;
    case "playlist":
      return s.nombre;
  }
}

/**
 * Reconstruye la semilla desde los parámetros de la url.
 *
 * Devuelve la de siempre ante cualquier cosa rara. Una semilla mal formada no
 * debe dejar la pantalla en blanco: el descubrimiento por tus tops siempre
 * tiene sentido.
 */
export function semillaDeParams(p: {
  tipo?: string;
  a?: string;
  b?: string;
}): Semilla {
  const tipo = p.tipo && esTipoSemilla(p.tipo) ? p.tipo : "tops";
  const a = p.a?.trim();
  const b = p.b?.trim();

  switch (tipo) {
    case "artista":
      return a ? { tipo, nombre: a } : { tipo: "tops" };
    case "genero":
      return a ? { tipo, nombre: a } : { tipo: "tops" };
    case "playlist":
      return a ? { tipo, id: a, nombre: b || "una playlist tuya" } : { tipo: "tops" };
    case "cancion":
    case "album":
      return a && b ? { tipo, artista: a, titulo: b } : { tipo: "tops" };
    default:
      return { tipo: "tops" };
  }
}

/** Una pista que sirve de punto de partida para pedir parecidos. */
export type PistaSemilla = { artista: string; titulo: string };

/**
 * Convierte varias pistas en ramas, una por pista.
 *
 * Una rama por pista y no una sola con todo: la mezcla cuenta cuántas ramas
 * traen cada candidato, y esa cifra es la señal de «aparece cerca de varias
 * cosas que te gustan». Con una rama única se perdería.
 */
export function ramasDePistas(
  pistas: PistaSemilla[],
  similares: (p: PistaSemilla) => Promise<{ artista: string; titulo: string; match: number }[]>,
  origen: (p: PistaSemilla) => string,
): Promise<Rama[]> {
  return pistas.reduce<Promise<Rama[]>>(
    async (acc, p) => {
      const ramas = await acc;
      // En serie: el limitador de Last.fm es una cola única, así que lanzarlas
      // en paralelo no las aceleraría y sí haría más difícil saber cuál falló.
      ramas.push({ origen: origen(p), entradas: await similares(p) });
      return ramas;
    },
    Promise.resolve([]),
  );
}
