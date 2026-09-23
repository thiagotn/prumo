import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth/session';
import { MODULE_DEFS } from '@/lib/modules';
import { initialModule } from '@/lib/rbac';
import { isPlatformHost, requestHost, tenantByHost } from '@/lib/tenant';
import { BrandPanel } from './brand-panel';
import { LoginForm } from './login-form';
import styles from './login.module.css';

export const metadata: Metadata = { title: 'Entrar' };

export default async function LoginPage() {
  const host = await requestHost();
  const platform = isPlatformHost(host);
  const tenant = platform ? null : await tenantByHost(host);

  if (!platform && (!tenant || !tenant.active)) notFound();

  // Already signed in: no point showing the form again.
  const session = await currentSession(tenant?.id ?? null);
  if (session) {
    if (session.twoFactorRequired && !session.twoFactorOk) {
      redirect(session.totpEnrolled ? '/login/2fa' : '/login/2fa/setup');
    }
    redirect(MODULE_DEFS[initialModule(session.role)].path);
  }

  return (
    <main className={styles.screen} id="content">
      <BrandPanel
        name={tenant?.name ?? 'Ateliê'}
        subtitle={tenant?.subtitle ?? 'Plataforma de gestão clínica'}
        monogram={tenant?.monogram ?? 'AT'}
      />
      <section className={styles.panel}>
        <h2 className={styles.title}>Entrar</h2>
        <p className={styles.subtitle}>
          {platform
            ? 'Acesso da equipe da plataforma.'
            : 'Use o e-mail cadastrado pela administração da clínica.'}
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
