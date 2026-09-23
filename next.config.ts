import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // imagem de produção roda `node server.js` (ver Dockerfile) — padrão do homelab
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // dados de saúde: nada de cache intermediário nem indexação
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
