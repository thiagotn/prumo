import type { Metadata } from 'next';
import Link from 'next/link';
import { ConsentStatus, Role } from '@prisma/client';
import { requireModule } from '@/lib/auth/guards';
import { CONSENT_STATUS_LABELS, CONSENT_STATUS_TAG } from '@/lib/consent';
import { withTenant } from '@/lib/db';
import { dateTime, longDate } from '@/lib/format';
import { canWrite } from '@/lib/rbac';
import { WriteDeniedNotice } from '../denied-notice';
import styles from './consents.module.css';

export const metadata: Metadata = { title: 'Termos de consentimento' };

/** Product copy, pt-BR. */
const SAVED_NOTICES: Record<string, string> = {
  template: 'Edição do termo publicada. O que já estava assinado continua como estava.',
  cancelled: 'Termo cancelado.',
};

export default async function ConsentsPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; saved?: string; cancelled?: string }>;
}) {
  const { tenant, session } = await requireModule('consents');
  const { denied, saved, cancelled } = await searchParams;
  if (!tenant) return <p className="card-body">Esta tela pertence a uma clínica.</p>;

  const mayWrite = canWrite(session.role, 'consents');
  const isOwner = session.role === Role.OWNER;

  const { pending, signed, templates } = await withTenant(tenant.id, async (tx) => ({
    pending: await tx.consent.findMany({
      where: { status: ConsentStatus.PENDING },
      orderBy: { createdAt: 'desc' },
      include: { patient: { select: { name: true } } },
      take: 100,
    }),
    signed: await tx.consent.findMany({
      where: { status: ConsentStatus.SIGNED },
      orderBy: { signedAt: 'desc' },
      include: { patient: { select: { name: true } } },
      take: 25,
    }),
    templates: await tx.consentTemplate.findMany({
      where: { current: true },
      orderBy: { title: 'asc' },
      include: { procedure: { select: { name: true } }, _count: { select: { consents: true } } },
    }),
  }));

  const notice = cancelled ? SAVED_NOTICES.cancelled : saved ? SAVED_NOTICES[saved] : null;

  return (
    <div className={styles.layout}>
      <div>
        <WriteDeniedNotice denied={denied} what="Emitir e colher termos" />
        <WriteDeniedNotice
          denied={denied}
          code="owner"
          what="Escrever o texto de um termo"
          by="da doutora"
        />
        {notice ? (
          <p className={styles.saved} role="status">
            {notice}
          </p>
        ) : null}

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Aguardando assinatura</h2>
            <span className={styles.spacer} />
            {mayWrite && templates.length > 0 ? (
              <Link className="btn btn-primary touch" href="/consents/new" style={{ fontSize: 12 }}>
                Emitir termo
              </Link>
            ) : null}
          </div>

          <div className={styles.tableWrap}>
            {pending.length === 0 ? (
              <p className={styles.empty}>Nenhum termo pendente.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>Termo</th>
                    <th>Emitido</th>
                    <th>Link vence</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((consent) => (
                    <tr key={consent.id}>
                      <td>
                        <Link href={`/consents/${consent.id}`}>{consent.patient.name}</Link>
                      </td>
                      <td>{consent.titleSnapshot}</td>
                      <td className="num">{longDate(consent.createdAt)}</td>
                      <td className="num">
                        {consent.tokenExpiresAt ? (
                          consent.tokenExpiresAt < new Date() ? (
                            <span className="tag tag-outline">expirado</span>
                          ) : (
                            dateTime(consent.tokenExpiresAt)
                          )
                        ) : (
                          'link não gerado'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Assinados</h2>
          </div>
          <div className={styles.tableWrap}>
            {signed.length === 0 ? (
              <p className={styles.empty}>Nenhum termo assinado ainda.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>Termo</th>
                    <th>Assinado</th>
                    <th>Via</th>
                  </tr>
                </thead>
                <tbody>
                  {signed.map((consent) => (
                    <tr key={consent.id}>
                      <td>
                        <Link href={`/consents/${consent.id}`}>{consent.patient.name}</Link>
                      </td>
                      <td>
                        {consent.titleSnapshot}
                        <span className={`tag ${CONSENT_STATUS_TAG[consent.status]}`} style={{ marginLeft: 8 }}>
                          {CONSENT_STATUS_LABELS[consent.status]}
                        </span>
                      </td>
                      <td className="num">{consent.signedAt ? dateTime(consent.signedAt) : '—'}</td>
                      <td>
                        <a href={`/api/consents/${consent.id}/pdf`}>PDF</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      <aside className={styles.panel} aria-label="Modelos de termo">
        <div className="kicker">Modelos</div>
        <h2 className={styles.sectionTitle} style={{ margin: 'var(--space-1) 0 var(--space-3)' }}>
          Termos da clínica
        </h2>

        {templates.length === 0 ? (
          <p className={styles.formHint}>
            Nenhum termo escrito ainda.
            {isOwner ? ' Escreva o primeiro para começar a colher assinaturas.' : ''}
          </p>
        ) : (
          <div>
            {templates.map((template) => (
              <div className={styles.templateRow} key={template.id}>
                <div>
                  <div className={styles.templateName}>{template.title}</div>
                  <div className={styles.templateMeta}>
                    edição {template.version}
                    {template.procedure ? ` · ${template.procedure.name}` : ''}
                    {template._count.consents > 0
                      ? ` · ${template._count.consents} emitido${template._count.consents === 1 ? '' : 's'}`
                      : ''}
                  </div>
                </div>
                {isOwner ? (
                  <Link
                    className={styles.spacer}
                    href={`/consents/templates/${template.id}/edit`}
                    style={{ fontSize: 12 }}
                  >
                    Nova edição
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {isOwner ? (
          <Link
            className="btn btn-secondary btn-block touch"
            href="/consents/templates/new"
            style={{ fontSize: 12, marginTop: 'var(--space-4)' }}
          >
            Novo termo
          </Link>
        ) : (
          <p className={styles.formHint} style={{ marginTop: 'var(--space-4)' }}>
            O texto dos termos é escrito pela doutora. Você emite, envia o link e colhe a assinatura.
          </p>
        )}
      </aside>
    </div>
  );
}
