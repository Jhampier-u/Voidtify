import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack's workspace root to this project. Without it, Next.js
  // detects a stray package-lock.json elsewhere and tries to resolve modules
  // from the wrong directory, breaking tailwindcss resolution.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
