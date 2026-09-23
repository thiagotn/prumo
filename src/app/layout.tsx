import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Lora } from 'next/font/google';
import '@/styles/globals.css';
import { normalizeHex } from '@/lib/color';
import { isPlatformHost, requestHost, tenantByHost } from '@/lib/tenant';

// Self-hosted: no request to fonts.googleapis.com in production.
// Cormorant goes up to 600 (the ceiling for interface headings); 300/400 for display.
const cormorant = Cormorant_Garamond({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-display',
  display: 'swap',
});

const lora = Lora({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-text',
  display: 'swap',
});

/** The reseller's accent, used on platform hosts and as a last resort. */
const PLATFORM_ACCENT = '#7d5411';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f3f2f2',
};

export async function generateMetadata(): Promise<Metadata> {
  const host = await requestHost();
  const tenant = isPlatformHost(host) ? null : await tenantByHost(host);
  return {
    title: {
      default: tenant ? tenant.name : 'Ateliê · Plataforma',
      template: `%s · ${tenant ? tenant.name : 'Ateliê'}`,
    },
    description: 'Prontuário, agenda e caixa em um só lugar.',
    // Sensitive health data: never in a search engine.
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const host = await requestHost();
  const tenant = isPlatformHost(host) ? null : await tenantByHost(host);
  const accent = (tenant && normalizeHex(tenant.accentColor)) || PLATFORM_ACCENT;

  return (
    <html
      lang="pt-BR"
      className={`${cormorant.variable} ${lora.variable}`}
      // The tenant's colour replaces the design system token at runtime
      // (docs/especificacao.md, "Multi-tenant / white-label").
      style={{ '--color-accent': accent, '--brand': accent } as React.CSSProperties}
    >
      <body>
        <a className="skip-link" href="#content">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
