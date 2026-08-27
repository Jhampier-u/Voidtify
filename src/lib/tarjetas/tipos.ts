/**
 * Lo que necesita cada tarjeta para dibujarse.
 *
 * Vive aparte del dibujo y de las consultas a propósito: así el dibujo es una
 * función pura de datos a JSX y se puede renderizar en una prueba, mirar el PNG
 * y ajustarlo. Con las consultas dentro no habría forma de ver una tarjeta sin
 * levantar el servidor e iniciar sesión, que es como se diseñaron las
 * anteriores — a ciegas, y se nota.
 */

export const TIPOS = ["resumen", "top-artistas", "cartel", "racha"] as const;

export type Tipo = (typeof TIPOS)[number];

export function esTipo(v: string): v is Tipo {
  return (TIPOS as readonly string[]).includes(v);
}

/** Vertical para historias, cuadrado para publicaciones de muro. */
export const FORMATOS = {
  historia: { ancho: 1080, alto: 1920 },
  cuadrado: { ancho: 1080, alto: 1080 },
} as const;

export type NombreFormato = keyof typeof FORMATOS;

export function esFormato(v: string): v is NombreFormato {
  return v === "historia" || v === "cuadrado";
}

export type Entrada = {
  nombre: string;
  /** Artista, en canciones y álbumes. */
  secundario?: string;
  plays: number;
  ms: number;
  /** Foto o carátula. Falta mientras la caché se llena. */
  imagen?: string;
};

export type DatosTarjeta = {
  /** «Últimas 4 semanas». */
  etiqueta: string;
  /** «2026-07-31 — 2026-08-27». */
  periodo: string;
  horas: number;
  reproducciones: number;
  artistas: number;
  canciones: number;
  racha: number;
  rachaMaxima: number;
  /** Los más escuchados, con foto. */
  topArtistas: Entrada[];
  /** Las más escuchadas, con carátula. */
  topCanciones: Entrada[];
  /** Carátulas sueltas para el mosaico de fondo. */
  mosaico: string[];
};
