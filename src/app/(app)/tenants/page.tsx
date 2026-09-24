import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSuperadmin } from '@/lib/auth/guards';
import { withPlatformScope } from '@/lib/db';
import { currentMonthKey, monthBounds, monthLabel } from '@/lib/finance';
import { currency, longDate, percent } from '@/lib/format';
import { readFlags } from '@/lib/flags';
import { BILLING_LABELS, BILLING_TAG, PLAN_LABELS, summarize } from '@/lib/reseller';
import { impersonate } from './actions';
import styles from './tenants.module.css';

export const metadata: Metadata = { title: 'Clínicas na plataforma' };

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ falha?: string }>;
}) {
  await requireSuperadmin();
  const { falha } = await searchParams;

  const month = currentMonthKey();
  const { from, to } = monthBounds(month);

  const tenants = await withPlatformScope((tx) =>
    tx.tenant.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { users: true } },
        // The canonical one first: it is the address the clinic calls its own.
        domains: { orderBy: [{ primary: 'desc' }, { createdAt: 'asc' }], take: 1 },
      },
    }),
  );

  // Appointments in the month, per clinic: the use behind the subscription.
  const usage = await withPlatformScope((tx) =>
    tx.appointment.groupBy({
      by: ['tenantId'],
      where: { startsAt: { gte: from, lt: to }, isBlock: false },
      _count: { _all: true },
    }),
  );
  const appointmentsOf = (tenantId: string) =>
    usage.find((row) => row.tenantId === tenantId)?._count._all ?? 0;

  const summary = summarize(
    tenants.map((tenant) => ({
      id: tenant.id,
      active: tenant.active,
      monthlyFee: tenant.monthlyFee === null ? null : Number(tenant.monthlyFee),
      createdAt: tenant.createdAt,
      deactivatedAt: tenant.deactivatedAt,
    })),
    month,
  );

  const KPIS = [
    {
      label: 'Clínicas ativas',
      value: String(summary.active),
      note: `${summary.gained} entrou${summary.gained === 1 ? '' : 'ram'} em ${monthLabel(month)}`,
    },
    {
      label: 'MRR',
      value: currency(summary.mrr, { cents: false }),
      note:
        summary.withoutFee > 0
          ? `${summary.withoutFee} clínica${summary.withoutFee === 1 ? '' : 's'} sem mensalidade registrada`
          : 'soma das mensalidades das clínicas ativas',
    },
    {
      label: 'Atendimentos no mês',
      value: String(usage.reduce((total, row) => total + row._count._all, 0)),
      note: 'marcados em todas as clínicas',
    },
    {
      label: 'Churn do mês',
      value: percent(summary.churn),
      note: `${summary.lost} saiu${summary.lost === 1 ? '' : 'ram'} sobre o que estava aberto no dia 1º`,
    },
  ];

  return (
    <div>
      {falha === 'sem-porta' ? (
        <div className={styles.warning} role="status">
          Não dá para entrar nessa clínica: ela não tem doutora ativa nem endereço por onde
          assumir a sessão. Cadastre um deles antes.
        </div>
      ) : null}

      <section className={styles.kpiBand} aria-label="Indicadores da plataforma">
        {KPIS.map((kpi) => (
          <div className={styles.kpi} key={kpi.label}>
            <div className="kicker">{kpi.label}</div>
            <div className={`${styles.kpiValue} num`}>{kpi.value}</div>
            <div className={styles.kpiNote}>{kpi.note}</div>
          </div>
        ))}
      </section>

      <div className={styles.tableWrap}>
        <table className="table">
          <thead>
            <tr>
              <th>Clínica</th>
              <th>Plano</th>
              <th>Cobrança</th>
              <th>Mensalidade</th>
              <th>Usuários</th>
              <th>Módulos</th>
              <th>Atend. no mês</th>
              <th>Desde</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => {
              const flags = readFlags(tenant.enabledModules);
              const on = Object.values(flags).filter(Boolean).length;
              return (
                <tr key={tenant.id} className={tenant.active ? undefined : styles.inactive}>
                  <td>
                    <span className={styles.brand}>
                      <span className={styles.dot} style={{ background: tenant.accentColor }} />
                      <Link href={`/tenants/${tenant.id}`}>{tenant.name}</Link>
                      {tenant.active ? null : <span className="tag tag-neutral">inativa</span>}
                    </span>
                    <span className={styles.kpiNote}>{tenant.domains[0]?.host ?? tenant.domain}</span>
                  </td>
                  <td>{PLAN_LABELS[tenant.plan]}</td>
                  <td>
                    <span className={`tag ${BILLING_TAG[tenant.billingStatus]}`}>
                      {BILLING_LABELS[tenant.billingStatus]}
                    </span>
                  </td>
                  <td className="num">
                    {tenant.monthlyFee === null ? '—' : currency(Number(tenant.monthlyFee))}
                  </td>
                  <td className="num">{tenant._count.users}</td>
                  <td className="num">
                    {on} de {Object.keys(flags).length}
                  </td>
                  <td className="num">{appointmentsOf(tenant.id)}</td>
                  <td className="num">{longDate(tenant.createdAt)}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <Link href={`/tenants/${tenant.id}`} style={{ fontSize: 12 }}>
                        Editar
                      </Link>
                      {tenant.active && tenant.domains[0] ? (
                        <form action={impersonate}>
                          <input type="hidden" name="tenantId" value={tenant.id} />
                          <button className="btn btn-ghost" type="submit" style={{ fontSize: 11 }}>
                            Entrar como
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className={styles.note}>
        <strong>Entrar como</strong> abre a clínica no endereço dela, como a doutora, por uma hora.
        A faixa no topo diz que a sessão foi assumida pela plataforma, o prontuário e as fotos ficam
        mascarados, e tudo — a entrada e cada tela aberta — vai para o log de auditoria daquela
        clínica. É suporte, não atalho: a clínica consegue ver depois tudo o que foi visto.
      </p>
    </div>
  );
}
