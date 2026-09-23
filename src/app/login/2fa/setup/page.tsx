import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { currentSession } from '@/lib/auth/session';
import { otpAuthUri, readableSecret } from '@/lib/auth/totp';
import { MODULE_DEFS } from '@/lib/modules';
import { initialModule } from '@/lib/rbac';
import { isPlatformHost, requestHost, tenantByHost } from '@/lib/tenant';
import { pendingTotpSecret } from '../../actions';
import { BrandPanel } from '../../brand-panel';
import { CodeForm } from '../../code-form';
import styles from '../../login.module.css';

export const metadata: Metadata = { title: 'Ativar verificação em duas etapas' };

export default async function TwoFactorSetupPage() {
  const host = await requestHost();
  const platform = isPlatformHost(host);
  const tenant = platform ? null : await tenantByHost(host);
  if (!platform && (!tenant || !tenant.active)) notFound();

  const session = await currentSession(tenant?.id ?? null);
  if (!session) redirect('/login');
  if (session.twoFactorOk) redirect(MODULE_DEFS[initialModule(session.role)].path);
  if (session.totpEnrolled) redirect('/login/2fa');

  const pending = await pendingTotpSecret();
  if (!pending?.secret) redirect('/login/2fa');

  const issuer = tenant?.name ?? 'Ateliê';
  const uri = otpAuthUri({ base32Secret: pending.secret, email: pending.email, issuer });
  // Rendered on the server: the secret never passes through client-side JavaScript.
  const qrSvg = await QRCode.toString(uri, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#201f1d', light: '#0000' },
  });

  return (
    <main className={styles.screen} id="content">
      <BrandPanel
        name={issuer}
        subtitle={tenant?.subtitle ?? 'Plataforma de gestão clínica'}
        monogram={tenant?.monogram ?? 'AT'}
      />
      <section className={styles.panel}>
        <div className="kicker">Primeiro acesso</div>
        <h2 className={styles.title} style={{ marginTop: 'var(--space-2)' }}>
          Ative a verificação em duas etapas
        </h2>
        <p className={styles.subtitle}>
          Seu perfil acessa prontuário e fotos clínicas, então o segundo fator é obrigatório.
        </p>

        <div className={styles.form}>
          <ol className={styles.steps}>
            <li>Abra seu app autenticador (Google Authenticator, Authy, 1Password).</li>
            <li>Escaneie o código abaixo ou digite a chave manualmente.</li>
            <li>Informe o código de 6 dígitos que aparecer.</li>
          </ol>

          <div
            className={styles.qr}
            aria-label="QR code para cadastro no app autenticador"
            // Server-generated SVG built from the secret itself, no user input involved.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />

          <div className={styles.secret} aria-label="Chave para digitação manual">
            {readableSecret(pending.secret)}
          </div>
        </div>

        <div style={{ marginTop: 'var(--space-4)' }}>
          <CodeForm mode="enrol" />
        </div>
      </section>
    </main>
  );
}
