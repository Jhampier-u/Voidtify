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
    // Las fotos de artista y las caratulas viven en el CDN de Spotify. Sin
    // declararlo, `next/image` rechaza la url y no se ve nada.
    remotePatterns: [{ protocol: "https", hostname: "i.scdn.co" }],
  },
};

export default nextConfig;
