import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth/session';
import { MODULE_DEFS } from '@/lib/modules';
import { initialModule } from '@/lib/rbac';
import { isPlatformHost, requestHost, tenantByHost } from '@/lib/tenant';
import { BrandPanel } from '../brand-panel';
import { CodeForm } from '../code-form';
import styles from '../login.module.css';

export const metadata: Metadata = { title: 'Verificação em duas etapas' };

export default async function TwoFactorPage() {
  const host = await requestHost();
  const platform = isPlatformHost(host);
  const tenant = platform ? null : await tenantByHost(host);
  if (!platform && (!tenant || !tenant.active)) notFound();

  const session = await currentSession(tenant?.id ?? null);
  if (!session) redirect('/login');
  if (session.twoFactorOk) redirect(MODULE_DEFS[initialModule(session.role)].path);
  if (!session.totpEnrolled) redirect('/login/2fa/setup');

  return (
    <main className={styles.screen} id="content">
      <BrandPanel
        name={tenant?.name ?? 'Ateliê'}
        subtitle={tenant?.subtitle ?? 'Plataforma de gestão clínica'}
        monogram={tenant?.monogram ?? 'AT'}
      />
      <section className={styles.panel}>
        <div className="kicker">Segunda etapa</div>
        <h2 className={styles.title} style={{ marginTop: 'var(--space-2)' }}>
          Confirme que é você
        </h2>
        <p className={styles.subtitle}>
          Digite o código de 6 dígitos do seu app autenticador. Ele muda a cada 30 segundos.
        </p>
        <CodeForm mode="verify" />
      </section>
    </main>
  );
}
