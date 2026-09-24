import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireModule } from '@/lib/auth/guards';
import {
  CONSENT_STATUS_LABELS,
  CONSENT_STATUS_TAG,
  formatHash,
  paragraphs,
} from '@/lib/consent';
import { withTenant } from '@/lib/db';
import { dateTime, longDate } from '@/lib/format';
import { canWrite } from '@/lib/rbac';
import { cancelConsent } from '../actions';
import { LinkBox } from '../link-box';
import { SignOnScreenForm } from '../sign-on-screen-form';
import styles from '../consents.module.css';

export const metadata: Metadata = { title: 'Termo' };

export default async function ConsentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ issued?: string; signed?: string }>;
}) {
  const { tenant, session } = await requireModule('consents');
  const { id } = await params;
  const { issued, signed } = await searchParams;
  if (!tenant) return <p className="card-body">Esta tela pertence a uma clínica.</p>;

  const data = await withTenant(tenant.id, async (tx) => {
    const consent = await tx.consent.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, name: true } },
        appointment: { include: { procedure: true } },
        template: { select: { slug: true, title: true, version: true } },
      },
    });
    if (!consent) return null;

    // The edition in force today, which is a different ROW from the one this consent was
    // copied from — that is the whole point of publishing rather than editing.
    const current = await tx.consentTemplate.findFirst({
      where: { slug: consent.template.slug, current: true },
      select: { version: true },
    });
    return { consent, currentVersion: current?.version ?? consent.templateVersion };
  });
  if (!data) notFound();
  const { consent, currentVersion } = data;

  const mayWrite = canWrite(session.role, 'consents');
  const pending = consent.status === 'PENDING';
  const linkLive = Boolean(consent.tokenExpiresAt && consent.tokenExpiresAt > new Date());

  return (
    <div>
      <div className="kicker">
        Termo · edição {consent.templateVersion}
        {currentVersion !== consent.templateVersion
          ? ` · o modelo já está na ${currentVersion}`
          : ''}
      </div>
      <h2 className={styles.title}>{consent.titleSnapshot}</h2>
      <p className={styles.meta}>
        <Link href={`/patients?selected=${consent.patient.id}`}>{consent.patient.name}</Link>
        {consent.appointment?.procedure ? ` · ${consent.appointment.procedure.name}` : ''}
        {consent.appointment ? ` · ${longDate(consent.appointment.startsAt)}` : ''} ·{' '}
        <span className={`tag ${CONSENT_STATUS_TAG[consent.status]}`}>
          {CONSENT_STATUS_LABELS[consent.status]}
        </span>
      </p>

      {issued ? (
        <p className={styles.saved} role="status">
          Termo emitido. Colha a assinatura na tela ou envie o link para a paciente.
        </p>
      ) : null}
      {signed ? (
        <p className={styles.saved} role="status">
          Assinatura registrada. O PDF já pode ser baixado.
        </p>
      ) : null}

      <div className={styles.term}>
        {paragraphs(consent.bodySnapshot).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>

      {consent.status === 'SIGNED' ? (
        <div className={styles.signature}>
          <div className="kicker">Assinatura</div>
          {/* eslint-disable-next-line @next/next/no-img-element -- the signature comes
              from the database as a data URI, not from a file the optimiser can fetch. */}
          <img
            className={styles.signatureImage}
            src={`data:image/png;base64,${Buffer.from(consent.signatureImage ?? new Uint8Array()).toString('base64')}`}
            alt={`Assinatura de ${consent.signerName ?? ''}`}
          />
          <p style={{ margin: 'var(--space-2) 0', fontSize: 13 }}>
            <strong>{consent.signerName}</strong>
            {consent.signerNote ? ` · ${consent.signerNote}` : ''}
            <br />
            {consent.signedAt ? dateTime(consent.signedAt) : ''}
            {consent.signedIp ? ` · IP ${consent.signedIp}` : ''} ·{' '}
            {consent.collectedByUserId ? 'assinado na clínica' : 'assinado por link'}
          </p>
          <p className={styles.hash}>
            Verificação: {consent.signatureHash ? formatHash(consent.signatureHash) : '—'}
            <br />
            Esse número é calculado sobre o texto, o nome de quem assinou, o instante e o traço da
            assinatura. Qualquer alteração em um deles muda o número — é o que prova que o PDF
            corresponde ao que foi assinado.
          </p>
          <a
            className="btn btn-primary touch"
            href={`/api/consents/${consent.id}/pdf`}
            style={{ fontSize: 12, marginTop: 'var(--space-3)' }}
          >
            Baixar PDF
          </a>
        </div>
      ) : null}

      {pending && mayWrite ? (
        <>
          <LinkBox consentId={consent.id} hasLink={linkLive} />

          <section style={{ marginTop: 'var(--space-6)' }}>
            <div className="kicker">Assinatura em tela</div>
            <SignOnScreenForm consentId={consent.id} patientName={consent.patient.name} />
          </section>

          <form action={cancelConsent} style={{ marginTop: 'var(--space-6)' }}>
            <input type="hidden" name="consentId" value={consent.id} />
            <button className="btn btn-ghost" type="submit" style={{ fontSize: 12 }}>
              Cancelar este termo
            </button>
          </form>
        </>
      ) : null}

      {pending && !mayWrite ? (
        <p className={styles.formHint} style={{ marginTop: 'var(--space-5)' }}>
          Este termo aguarda assinatura. Quem colhe é a recepção ou a doutora.
        </p>
      ) : null}
    </div>
  );
}
