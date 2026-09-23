import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Endereço não encontrado' };

/**
 * Covers two cases: a hostname belonging to no clinic, and a route that does not exist.
 * The copy does not say which — we do not confirm the existence of instances to anyone
 * scanning domains.
 */
export default function NotFound() {
  return (
    <main
      id="content"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--space-6)',
        background: 'var(--color-neutral-900)',
        color: 'var(--color-bg)',
      }}
    >
      <div style={{ maxWidth: '30em', textAlign: 'center' }}>
        <div className="kicker kicker-accent">Endereço indisponível</div>
        <h1
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 300,
            fontSize: 42,
            lineHeight: 1.1,
            margin: 'var(--space-4) 0 var(--space-3)',
          }}
        >
          Não há nada neste endereço.
        </h1>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.75,
            color: 'color-mix(in srgb, var(--color-bg) 62%, transparent)',
            margin: 0,
          }}
        >
          Confira o endereço com a administração da clínica.
        </p>
      </div>
    </main>
  );
}
