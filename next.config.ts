import type { NextConfig } from "next";

/**
 * Orígenes desde los que se aceptan las peticiones internas en desarrollo.
 *
 * En `next dev`, Next bloquea las peticiones a `/_next/*` y los Server Actions
 * que llegan con un origen distinto al del servidor. Detrás de un túnel eso
 * rompe dos cosas a la vez sin decir nada en pantalla: las acciones no llegan
 * —no aparece ni un POST en el log— y `/_next/image` deja de servir carátulas.
 *
 * Sale de `AUTH_URL`, que ya guarda el origen público, para no tener dos
 * sitios donde apuntar el mismo dominio y que se separen.
 */
function origenesDeDesarrollo(): string[] {
  const url = process.env.AUTH_URL;
  if (!url) return [];
  try {
    return [new URL(url).host];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  allowedDevOrigins: origenesDeDesarrollo(),

  // Pin Turbopack's workspace root to this project. Without it, Next.js
  // detects a stray package-lock.json elsewhere and tries to resolve modules
  // from the wrong directory, breaking tailwindcss resolution.
  turbopack: {
    root: process.cwd(),
  },

  images: {
    /**
     * Los CDN de imagen de Spotify.
     *
     * Estaba declarado solo `i.scdn.co`, que sirve carátulas y fotos de
     * artista, y la portada de una playlist reventaba la página entera con un
     * error de ejecución. Spotify usa cuatro hosts en esta cuenta —`i.scdn.co`,
     * `mosaic.scdn.co`, `image-cdn-ak.spotifycdn.com` e
     * `image-cdn-fa.spotifycdn.com`— y los sufijos `-ak` y `-fa` son fragmentos
     * de CDN que rotan, así que listarlos uno a uno volvería a romperse el día
     * que aparezca un tercero. El comodín cubre los dos dominios enteros.
     *
     * `search: ""` prohíbe la cadena de consulta: de 210 urls suyas revisadas
     * no la lleva ninguna, y dejarla abierta permitiría optimizar direcciones
     * que nadie ha previsto.
     */
    remotePatterns: [
      { protocol: "https", hostname: "**.scdn.co", search: "" },
      { protocol: "https", hostname: "**.spotifycdn.com", search: "" },
    ],
  },
};

export default nextConfig;
