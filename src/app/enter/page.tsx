import type { Metadata } from 'next';
import { currentTenant } from '@/lib/tenant';

export const metadata: Metadata = {
  title: 'Sessão assumida',
  robots: { index: false, follow: false },
};

/** Product copy, pt-BR. */
const REASONS: Record<string, string> = {
  unknown: 'Este link não vale para nada — confira se ele foi copiado inteiro.',
  used: 'Este link já foi usado. Volte ao painel da plataforma e entre de novo.',
  expired: 'Este link expirou. Ele vale por um minuto, de propósito.',
  'wrong-host': 'Este link pertence a outra clínica.',
};

/** The face of a refused ticket. Public, because the ticket is spent before any session. */
export default async function EnterFailedPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;
  const tenant = await currentTenant();

  return (
    <main
      id="content"
      style={{
        maxWidth: '34em',
        margin: '18vh auto',
        padding: 'var(--space-6)',
        border: '1px solid var(--color-divider)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-bg)',
      }}
    >
      <div className="kicker">{tenant?.name ?? 'Prumo'}</div>
      <h1
        style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 400,
          fontSize: 27,
          lineHeight: 1.2,
          margin: 'var(--space-2) 0 var(--space-3)',
        }}
      >
        Não deu para entrar
      </h1>
      <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0 }}>
        {REASONS[motivo ?? ''] ?? REASONS.unknown}
      </p>
      <p style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--color-neutral-600)' }}>
        A tentativa ficou registrada no log de auditoria desta clínica.
      </p>
    </main>
  );
}
