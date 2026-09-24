import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { audit } from '@/lib/audit';
import { hashToken } from '@/lib/auth/session';
import { paragraphs } from '@/lib/consent';
import { withTenant } from '@/lib/db';
import { dateTime, longDate } from '@/lib/format';
import { currentTenant } from '@/lib/tenant';
import { SignForm } from './sign-form';
import styles from './sign.module.css';

export const metadata: Metadata = {
  title: 'Termo de consentimento',
  // The root layout already says noindex; a health document says it twice.
  robots: { index: false, follow: false },
};

/**
 * The page the patient opens from the link the clinic sent her.
 *
 * No session: the token is the authorisation, and the clinic is whichever one the
 * hostname resolves to. A token that does not exist, one from another clinic and one for
 * a term already signed are told apart as little as possible.
 */
export default async function SignConsentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ signed?: string }>;
}) {
  const { token } = await params;
  const { signed } = await searchParams;

  const tenant = await currentTenant();
  if (!tenant || !tenant.active) notFound();

  const consent = await withTenant(tenant.id, (tx) =>
    tx.consent.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { patient: { select: { name: true } }, appointment: { include: { procedure: true } } },
    }),
  );
  if (!consent) notFound();

  const expired = !consent.tokenExpiresAt || consent.tokenExpiresAt < new Date();

  await audit({
    tenantId: tenant.id,
    userId: null,
    action: 'consent.view',
    resource: 'consent.link',
    resourceId: consent.id,
    details: { status: consent.status, expired },
  });

  const shell = (children: React.ReactNode) => (
    <main className={styles.page} id="content">
      <div className={styles.sheet}>
        <div className={`monogram ${styles.monogram}`}>{tenant.monogram}</div>
        <div className="kicker" style={{ marginTop: 'var(--space-3)' }}>
          {tenant.name}
        </div>
        {children}
      </div>
    </main>
  );

  if (consent.status === 'CANCELLED') {
    return shell(
      <>
        <h1 className={styles.title}>Termo cancelado</h1>
        <p className={styles.body}>
          Este termo foi cancelado pela clínica e não precisa mais ser assinado. Em caso de dúvida,
          fale com a recepção.
        </p>
      </>,
    );
  }

  if (consent.status === 'SIGNED') {
    return shell(
      <>
        <h1 className={styles.title}>{consent.titleSnapshot}</h1>
        {signed ? (
          <p className={styles.done} role="status">
            Assinatura registrada. Obrigada!
          </p>
        ) : null}
        <p className={styles.body}>
          Assinado por <strong>{consent.signerName}</strong>
          {consent.signedAt ? ` em ${dateTime(consent.signedAt)}` : ''}.
        </p>
        {expired ? (
          <p className={styles.body}>
            O link para baixar a via em PDF expirou. A clínica pode enviar uma nova cópia.
          </p>
        ) : (
          <a className="btn btn-primary btn-block touch" href={`/consent/${token}/pdf`}>
            Baixar minha via em PDF
          </a>
        )}
      </>,
    );
  }

  if (expired) {
    return shell(
      <>
        <h1 className={styles.title}>Link expirado</h1>
        <p className={styles.body}>
          Por segurança, o link de assinatura vale por poucos dias. Peça um novo à clínica — o termo
          continua aguardando sua assinatura.
        </p>
      </>,
    );
  }

  return shell(
    <>
      <h1 className={styles.title}>{consent.titleSnapshot}</h1>
      <p className={styles.meta}>
        {consent.patient.name}
        {consent.appointment?.procedure ? ` · ${consent.appointment.procedure.name}` : ''}
        {consent.appointment ? ` · ${longDate(consent.appointment.startsAt)}` : ''}
      </p>

      <div className={styles.term}>
        {paragraphs(consent.bodySnapshot).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>

      <p className={styles.note}>
        Ao assinar, você confirma que leu o texto acima e concorda com ele. Ficam registrados a data,
        a hora e o endereço de onde a assinatura partiu.
      </p>

      <SignForm token={token} patientName={consent.patient.name} />
    </>,
  );
}
