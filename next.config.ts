import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
