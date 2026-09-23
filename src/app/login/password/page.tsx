import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isPlatformHost, requestHost, tenantByHost } from '@/lib/tenant';
import { BrandPanel } from '../brand-panel';
import styles from '../login.module.css';

export const metadata: Metadata = { title: 'Esqueci a senha' };

export default async function PasswordRecoveryPage() {
  const host = await requestHost();
  const platform = isPlatformHost(host);
  const tenant = platform ? null : await tenantByHost(host);
  if (!platform && (!tenant || !tenant.active)) notFound();

  return (
    <main className={styles.screen} id="content">
      <BrandPanel
        name={tenant?.name ?? 'Ateliê'}
        subtitle={tenant?.subtitle ?? 'Plataforma de gestão clínica'}
        monogram={tenant?.monogram ?? 'AT'}
      />
      <section className={styles.panel}>
        <div className="kicker">Recuperação de acesso</div>
        <h2 className={styles.title} style={{ marginTop: 'var(--space-2)' }}>
          Esqueci a senha
        </h2>
        <p className={styles.subtitle}>
          A redefinição por e-mail entra junto com o e-mail transacional (etapa 6). Por enquanto,
          peça a troca para quem administra a clínica — ela redefine em Configurações e todas as suas
          sessões abertas são encerradas.
        </p>
        <div className={styles.form}>
          <a className="btn btn-secondary btn-block touch" href="/login">
            Voltar para o login
          </a>
        </div>
      </section>
    </main>
  );
}
