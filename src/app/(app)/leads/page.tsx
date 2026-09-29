import { LeadStatus } from '@prisma/client';
import type { Metadata } from 'next';
import Link from 'next/link';
import { audit } from '@/lib/audit';
import { requireSuperadmin } from '@/lib/auth/guards';
import { withPlatformScope } from '@/lib/db';
import { dateTime } from '@/lib/format';
import { LeadForm } from './lead-form';
import styles from './leads.module.css';

export const metadata: Metadata = { title: 'Quem pediu contato' };

/** Product copy, pt-BR. */
const STATUS_LABELS: Record<LeadStatus, string> = {
  [LeadStatus.NEW]: 'Novo',
  [LeadStatus.CONTACTED]: 'Respondido',
  [LeadStatus.ARCHIVED]: 'Arquivado',
};

const FILTERS: Array<{ key: string; label: string; status: LeadStatus | null }> = [
  { key: 'novos', label: 'Novos', status: LeadStatus.NEW },
  { key: 'respondidos', label: 'Respondidos', status: LeadStatus.CONTACTED },
  { key: 'arquivados', label: 'Arquivados', status: LeadStatus.ARCHIVED },
  { key: 'todos', label: 'Todos', status: null },
];

/**
 * The inbox of the public "tenho interesse" form.
 *
 * SUPERADMIN only, and the RLS policy on the table agrees: reading these rows needs
 * platform scope, which is the one thing a clinic session can never open. Opening the
 * screen writes `lead.view` — these are strangers' contact details, not our own data.
 */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { session } = await requireSuperadmin('leads');
  const { filtro } = await searchParams;

  const active = FILTERS.find((f) => f.key === filtro) ?? FILTERS[0]!;

  const [leads, counts] = await withPlatformScope((tx) =>
    Promise.all([
      tx.interestLead.findMany({
        where: active.status ? { status: active.status } : {},
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { handledBy: { select: { name: true } } },
      }),
      tx.interestLead.groupBy({ by: ['status'], _count: { _all: true } }),
    ]),
  );

  const countOf = (status: LeadStatus) =>
    counts.find((row) => row.status === status)?._count._all ?? 0;

  await audit({
    tenantId: null,
    userId: session.userId,
    action: 'lead.view',
    resource: 'interestLead',
    details: { filter: active.key, shown: leads.length },
  });

  return (
    <div>
      <nav className={styles.filters} aria-label="Filtrar por situação">
        {FILTERS.map((filter) => (
          <Link
            key={filter.key}
            className={`btn ${filter.key === active.key ? 'btn-primary' : 'btn-secondary'}`}
            href={`/leads?filtro=${filter.key}`}
            style={{ fontSize: 12 }}
          >
            {filter.label}
            {filter.status ? ` (${countOf(filter.status)})` : ''}
          </Link>
        ))}
      </nav>

      {leads.length === 0 ? (
        <p className={styles.empty}>
          Nada aqui. Os pedidos de contato chegam pelo formulário do site do produto, e aparecem
          nesta tela assim que são enviados.
        </p>
      ) : (
        <div className={styles.list}>
          {leads.map((lead) => (
            <article
              key={lead.id}
              className={`${styles.card} ${lead.status === LeadStatus.NEW ? styles.cardNew : ''}`}
            >
              <div className={styles.head}>
                <span className={styles.name}>{lead.name}</span>
                {lead.clinic ? <span className="tag tag-neutral">{lead.clinic}</span> : null}
                <span className="tag tag-outline">{STATUS_LABELS[lead.status]}</span>
                <span className={styles.when}>{dateTime(lead.createdAt)}</span>
              </div>

              <div className={styles.contact}>
                {/* encodeURIComponent so an address crafted with ?cc= or a newline cannot
                    turn this link into a mail header of somebody else's choosing. */}
                <a href={`mailto:${encodeURIComponent(lead.email)}`}>{lead.email}</a>
                {lead.phone ? <span>{lead.phone}</span> : null}
              </div>

              {lead.message ? <p className={styles.message}>{lead.message}</p> : null}

              <p className={styles.meta}>
                Chegou por {lead.host}
                {lead.handledBy && lead.handledAt
                  ? ` · ${lead.handledBy.name} em ${dateTime(lead.handledAt)}`
                  : ''}
              </p>

              <LeadForm id={lead.id} status={lead.status} note={lead.note ?? ''} />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
