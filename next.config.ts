import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Served through the portless reverse proxy (https://orbitone.local) instead
  // of localhost:PORT, so allow that origin to reach dev /_next/* assets.
  allowedDevOrigins: ['orbitone.local', 'orbitone.portless'],
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    // Tree-shake barrel imports (lucide-react pulls ~20 icons in page.tsx).
    optimizePackageImports: ['lucide-react'],
  },
}

export default nextConfig
