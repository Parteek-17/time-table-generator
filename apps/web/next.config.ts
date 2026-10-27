import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // packages/ui ships TypeScript source.
  transpilePackages: ['@slotwise/ui'],
  // Prisma loads its query engine from disk; keep it out of the bundle.
  serverExternalPackages: ['@prisma/client', '@slotwise/db'],
  // Institutes live on subdomains: demo.localhost:3000 in dev.
  // *.trycloudflare.com: a Cloudflare quick tunnel for live demos (docs/demo-tunnel.md).
  allowedDevOrigins: ['*.localhost', '*.trycloudflare.com'],
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
