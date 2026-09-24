import type { Metadata } from 'next';
import Link from 'next/link';
import { ConsentStatus, Role } from '@prisma/client';
import { requireModule } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import { currentMonthKey, monthBounds, monthLabel, summarize } from '@/lib/finance';
import { currency, percent } from '@/lib/format';
import { accessLevel, canAccess, ROLE_LABELS } from '@/lib/rbac';
import { dayBounds, slotLabel, STATUS_LABELS, STATUS_TAG, todayKey } from '@/lib/schedule';
import { productStatus, STATUS_LABELS as STOCK_LABELS } from '@/lib/stock';
import { DeniedNotice } from '../denied-notice';
import styles from './dashboard.module.css';

export const metadata: Metadata = { title: 'Painel' };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const { tenant, session } = await requireModule('dashboard');
  const { denied } = await searchParams;

  if (!tenant) {
    return (
      <>
        <DeniedNotice module={denied} />
        <p className="card-body">
          Esta é a plataforma, não uma clínica. Os números vivem em cada instância.
        </p>
      </>
    );
  }

  const money = accessLevel(session.role, 'finance');
  const ownOnly = session.role === Role.PRACTITIONER;
  const month = currentMonthKey();
  const { from, to } = monthBounds(month);
  const today = dayBounds(todayKey());
  const now = new Date();

  const data = await withTenant(tenant.id, async (tx) => ({
    // Money only for the profiles that reach it: the dashboard is not a way around the
    // finance permission.
    payments:
      money === 'none'
        ? []
        : await tx.payment.findMany({
            where: { createdAt: { gte: from, lt: to } },
            include: {
              encounter: {
                include: {
                  appointment: { include: { procedure: { select: { name: true } } } },
                },
              },
            },
          }),
    // Finance reaches no diary at all (docs/especificacao.md), and the dashboard is not
    // a way around that: for them the query does not even run.
    appointments: canAccess(session.role, 'schedule')
      ? await tx.appointment.findMany({
          where: {
            startsAt: { gte: today.from, lt: today.to },
            isBlock: false,
            ...(ownOnly ? { practitionerId: session.userId } : {}),
          },
          orderBy: { startsAt: 'asc' },
          include: { patient: { select: { name: true } }, room: { select: { name: true } } },
        })
      : [],
    lots: canAccess(session.role, 'inventory')
      ? await tx.stockLot.findMany({
          include: { product: { select: { id: true, brand: true } } },
        })
      : [],
    pendingConsents: canAccess(session.role, 'consents')
      ? await tx.consent.count({ where: { status: ConsentStatus.PENDING } })
      : 0,
  }));

  const rows = data.payments.map((payment) => {
    const appointment = payment.encounter.appointment;
    return {
      procedure: appointment?.procedure?.name ?? 'Sem procedimento',
      charged: Number(payment.charged),
      totalCost: Number(payment.totalCost),
      taxAmount: Number(payment.taxAmount),
      cardFeeAmount: Number(payment.cardFeeAmount),
      netProfit: Number(payment.netProfit),
      hours: appointment
        ? (appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 3_600_000
        : 0,
    };
  });
  const summary = summarize(rows);

  // Profit per hour by procedure line — the card that says which chair time pays best.
  const perHour = [...rows.reduce((acc, row) => {
    const current = acc.get(row.procedure) ?? { netProfit: 0, hours: 0 };
    acc.set(row.procedure, {
      netProfit: current.netProfit + row.netProfit,
      hours: current.hours + row.hours,
    });
    return acc;
  }, new Map<string, { netProfit: number; hours: number }>())]
    .map(([name, value]) => ({
      name,
      value: value.hours > 0 ? value.netProfit / value.hours : 0,
    }))
    .sort((a, b) => b.value - a.value);
  const perHourCeiling = Math.max(...perHour.map((line) => line.value), 1);

  // Stock pendencies, per product: what is out, and what is close to expiring.
  const byProduct = new Map<string, { brand: string; lots: typeof data.lots }>();
  for (const lot of data.lots) {
    const entry = byProduct.get(lot.product.id) ?? { brand: lot.product.brand, lots: [] };
    entry.lots.push(lot);
    byProduct.set(lot.product.id, entry);
  }
  const stockAlerts = [...byProduct.values()]
    .map((entry) => ({ brand: entry.brand, status: productStatus(entry.lots, now) }))
    .filter((entry) => entry.status === 'out' || entry.status === 'expired' || entry.status === 'expiring')
    .sort((a, b) => a.brand.localeCompare(b.brand, 'pt-BR'));

  // "Next today" means still to happen: what was already seen, or cancelled, is not next.
  const upcoming = data.appointments.filter(
    (appointment) =>
      appointment.endsAt >= now &&
      appointment.status !== 'ATTENDED' &&
      appointment.status !== 'CANCELLED' &&
      appointment.status !== 'NO_SHOW',
  );

  const KPIS =
    money === 'full'
      ? [
          { label: 'Atendimentos no mês', value: String(summary.count), note: monthLabel(month) },
          { label: 'Faturamento', value: currency(summary.charged, { cents: false }), note: `ticket médio ${currency(summary.ticket, { cents: false })}` },
          { label: 'Lucro líquido', value: currency(summary.netProfit, { cents: false }), note: `margem realizada ${percent(summary.margin)}` },
          { label: 'Lucro por hora', value: currency(summary.profitPerHour, { cents: false }), note: `${summary.hours.toFixed(1).replace('.', ',')}h de sala` },
        ]
      : money === 'partial'
        ? [
            { label: 'Atendimentos no mês', value: String(summary.count), note: monthLabel(month) },
            { label: 'Faturamento', value: currency(summary.charged, { cents: false }), note: `ticket médio ${currency(summary.ticket, { cents: false })}` },
            { label: 'Na agenda de hoje', value: String(data.appointments.length), note: `${upcoming.length} ainda por atender` },
            { label: 'Termos pendentes', value: String(data.pendingConsents), note: 'aguardando assinatura' },
          ]
        : [
            { label: 'Na sua agenda hoje', value: String(data.appointments.length), note: `${upcoming.length} ainda por atender` },
            { label: 'Termos pendentes', value: String(data.pendingConsents), note: 'aguardando assinatura' },
          ];

  return (
    <>
      <DeniedNotice module={denied} />

      <section
        className={`${styles.kpiBand} ${KPIS.length === 2 ? styles.kpiBandTwo : ''}`}
        aria-label="Indicadores do mês"
      >
        {KPIS.map((kpi) => (
          <div className={styles.kpi} key={kpi.label}>
            <div className="kicker">{kpi.label}</div>
            <div className={`${styles.kpiValue} num`}>{kpi.value}</div>
            <div className={styles.kpiNote}>{kpi.note}</div>
          </div>
        ))}
      </section>

      <div className={styles.columns}>
        {canAccess(session.role, 'schedule') ? (
        <div className="card">
          <div className="card-kicker">Próximos atendimentos de hoje</div>
          <div className="card-title">Agenda do dia</div>
          {upcoming.length === 0 ? (
            <p className="card-body">
              {data.appointments.length === 0
                ? 'Nada marcado para hoje.'
                : 'Todos os horários de hoje já passaram.'}{' '}
              O dia inteiro está em <Link href="/schedule">Agenda</Link>.
            </p>
          ) : (
            <ul className={styles.list}>
              {upcoming.slice(0, 6).map((appointment) => (
                <li className={styles.listItem} key={appointment.id}>
                  <span className={`${styles.listTime} num`}>
                    {slotLabel(appointment.startsAt, appointment.endsAt)}
                  </span>
                  <span className={styles.listName}>
                    <Link href={`/encounter?appointment=${appointment.id}`}>
                      {appointment.patient?.name ?? '—'}
                    </Link>
                    <br />
                    <span className={styles.kpiNote}>{appointment.room?.name ?? 'sala a definir'}</span>
                  </span>
                  <span className={`tag ${STATUS_TAG[appointment.status]}`}>
                    {STATUS_LABELS[appointment.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        ) : (
          <div className="card">
            <div className="card-kicker">Seu perfil</div>
            <div className="card-title">Números, não agenda</div>
            <p className="card-body">
              O Financeiro não alcança a agenda nem o prontuário. O que você vê aqui é o dinheiro do
              mês; os detalhes estão em <Link href="/finance">Financeiro</Link> e{' '}
              <Link href="/reports">Relatórios</Link>.
            </p>
          </div>
        )}

        <div>
          {money === 'full' ? (
            <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
              <div className="card-kicker">Lucro por hora</div>
              <div className="card-title">Por procedimento, no mês</div>
              {perHour.length === 0 ? (
                <p className="card-body">Nenhum atendimento fechado em {monthLabel(month)}.</p>
              ) : (
                <div className={styles.bars}>
                  {perHour.map((line) => (
                    <div key={line.name}>
                      <div className={styles.barLine}>
                        <span>{line.name}</span>
                        <span className="num">{currency(line.value, { cents: false })}</span>
                      </div>
                      <div className={styles.barTrack}>
                        <div
                          className={styles.barFill}
                          style={{ width: `${Math.max((line.value / perHourCeiling) * 100, 0)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="card">
            <div className="card-kicker">Pendências</div>
            <div className="card-title">O que precisa de atenção</div>
            {stockAlerts.length === 0 && data.pendingConsents === 0 ? (
              <p className="card-body">Nada pendente. Estoque em dia e nenhum termo esperando.</p>
            ) : (
              <ul className={styles.list}>
                {data.pendingConsents > 0 ? (
                  <li className={styles.listItem}>
                    <span className={styles.listName}>
                      <Link href="/consents">
                        {data.pendingConsents} termo{data.pendingConsents === 1 ? '' : 's'} sem
                        assinatura
                      </Link>
                    </span>
                  </li>
                ) : null}
                {stockAlerts.slice(0, 6).map((alert) => (
                  <li className={styles.listItem} key={alert.brand}>
                    <span className={styles.listName}>
                      <Link href="/inventory">{alert.brand}</Link>
                    </span>
                    <span className="tag tag-accent">{STOCK_LABELS[alert.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Who you are on this instance, and whether the second factor is settled — the one
          piece of the stage-1 instance card worth keeping in front of the doctor. */}
      <p className={styles.kpiNote} style={{ marginTop: 'var(--space-5)' }}>
        {ROLE_LABELS[session.role]} · {tenant.name}
        {tenant.defaultUnit ? ` · ${tenant.defaultUnit}` : ''}
        {session.twoFactorRequired
          ? ` · segundo fator ${session.twoFactorOk ? 'verificado nesta sessão' : 'pendente'}`
          : ''}
      </p>
    </>
  );
}
