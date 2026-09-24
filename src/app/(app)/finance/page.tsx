import type { Metadata } from 'next';
import Link from 'next/link';
import { PaymentMethod } from '@prisma/client';
import { requireModule } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import {
  addMonths,
  currentMonthKey,
  isMonthKey,
  monthBounds,
  monthLabel,
  summarize,
} from '@/lib/finance';
import { currency, percent, shortDate } from '@/lib/format';
import { currentPricingParams } from '@/lib/pricing-params';
import { MARGIN_ALERT, reserves } from '@/lib/pricing';
import styles from './finance.module.css';

export const metadata: Metadata = { title: 'Financeiro e caixa' };

/** Product copy, pt-BR. */
const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Dinheiro',
  PIX: 'Pix',
  DEBIT: 'Débito',
  CREDIT_UPFRONT: 'Crédito à vista',
  CREDIT_INSTALLMENT: 'Crédito parcelado',
};

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { tenant, level } = await requireModule('finance');
  const { month } = await searchParams;
  if (!tenant) return <p className="card-body">Esta tela pertence a uma clínica.</p>;

  const activeMonth = isMonthKey(month) ? month : currentMonthKey();
  const thisMonth = currentMonthKey();
  const { from, to } = monthBounds(activeMonth);

  // Reception records payments but never sees cost or margin (docs/especificacao.md).
  const full = level === 'full';

  const { payments, params } = await withTenant(tenant.id, async (tx) => ({
    payments: await tx.payment.findMany({
      where: { createdAt: { gte: from, lt: to } },
      orderBy: { createdAt: 'desc' },
      include: {
        encounter: {
          include: {
            patient: { select: { name: true } },
            product: { select: { brand: true } },
            appointment: { include: { procedure: { select: { name: true } } } },
          },
        },
      },
    }),
    params: await currentPricingParams(tx, tenant.id),
  }));

  const rows = payments.map((payment) => {
    const appointment = payment.encounter.appointment;
    return {
      id: payment.id,
      at: payment.createdAt,
      patient: payment.encounter.patient.name,
      procedure: appointment?.procedure?.name ?? payment.encounter.product?.brand ?? '—',
      method: payment.method,
      installments: payment.installments,
      charged: Number(payment.charged),
      totalCost: Number(payment.totalCost),
      taxAmount: Number(payment.taxAmount),
      cardFeeAmount: Number(payment.cardFeeAmount),
      netProfit: Number(payment.netProfit),
      margin: Number(payment.margin),
      hours: appointment
        ? (appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 3_600_000
        : 0,
    };
  });

  const summary = summarize(rows);
  const split = reserves(summary.netProfit);

  const href = (nextMonth: string) =>
    nextMonth === thisMonth ? '/finance' : `/finance?month=${nextMonth}`;

  const KPIS = full
    ? [
        { label: 'Faturamento', value: currency(summary.charged), note: `${summary.count} atendimento${summary.count === 1 ? '' : 's'}` },
        { label: 'Custos', value: currency(summary.totalCost), note: 'material, sala, descartáveis e rateio' },
        { label: 'Impostos e taxas', value: currency(summary.taxAndFee), note: 'imposto + maquininha' },
        { label: 'Lucro líquido', value: currency(summary.netProfit), note: `ticket médio ${currency(summary.ticket)}` },
        {
          label: 'Margem realizada',
          value: percent(summary.margin),
          note: `lucro por hora ${currency(summary.profitPerHour)}`,
          low: summary.margin < MARGIN_ALERT && summary.count > 0,
        },
      ]
    : [
        { label: 'Atendimentos', value: String(summary.count), note: monthLabel(activeMonth), low: false },
        { label: 'Faturamento', value: currency(summary.charged), note: `ticket médio ${currency(summary.ticket)}`, low: false },
      ];

  return (
    <div>
      <div className={styles.toolbar}>
        <Link className="btn btn-secondary" href={href(addMonths(activeMonth, -1))} style={{ fontSize: 12 }}>
          ←
        </Link>
        <span className={styles.monthLabel}>{monthLabel(activeMonth)}</span>
        <Link className="btn btn-secondary" href={href(addMonths(activeMonth, 1))} style={{ fontSize: 12 }}>
          →
        </Link>
        {activeMonth !== thisMonth ? (
          <Link className="btn btn-ghost" href="/finance" style={{ fontSize: 12 }}>
            Este mês
          </Link>
        ) : null}

        <div className={styles.spacer} />

        {full ? (
          <Link
            className="btn btn-secondary touch"
            href={`/api/reports/csv?from=${activeMonth}&to=${activeMonth}`}
            style={{ fontSize: 12 }}
          >
            Exportar CSV
          </Link>
        ) : null}
      </div>

      <section
        className={`${styles.kpiBand} ${full ? '' : styles.kpiBandPartial}`}
        aria-label="Indicadores do mês"
      >
        {KPIS.map((kpi) => (
          <div className={styles.kpi} key={kpi.label}>
            <div className="kicker">{kpi.label}</div>
            <div className={`${styles.kpiValue} num ${kpi.low ? styles.marginLow : ''}`}>
              {kpi.value}
            </div>
            <div className={styles.kpiNote}>{kpi.note}</div>
          </div>
        ))}
      </section>

      <div className={styles.columns}>
        <div className={styles.tableWrap}>
          {rows.length === 0 ? (
            <p className={styles.empty}>
              Nenhum atendimento fechado em {monthLabel(activeMonth)}.
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Paciente</th>
                  <th className={styles.hideOnPhone}>Procedimento</th>
                  <th className={styles.hideOnPhone}>Forma</th>
                  <th>Cobrado</th>
                  {full ? (
                    <>
                      <th className={styles.hideOnPhone}>Custos</th>
                      <th className={styles.hideOnPhone}>Imposto + taxa</th>
                      <th>Lucro</th>
                      <th>Margem</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="num">{shortDate(row.at)}</td>
                    <td>{row.patient}</td>
                    <td className={styles.hideOnPhone}>{row.procedure}</td>
                    <td className={styles.hideOnPhone}>
                      {METHOD_LABELS[row.method]}
                      {row.installments ? ` ${row.installments}x` : ''}
                    </td>
                    <td className="num">{currency(row.charged)}</td>
                    {full ? (
                      <>
                        <td className={`num ${styles.hideOnPhone}`}>{currency(row.totalCost)}</td>
                        <td className={`num ${styles.hideOnPhone}`}>
                          {currency(row.taxAmount + row.cardFeeAmount)}
                        </td>
                        <td className="num">{currency(row.netProfit)}</td>
                        <td
                          className={`num ${row.margin < MARGIN_ALERT ? styles.marginLow : ''}`}
                          // A hook for the tests, and a hint for anyone reading the DOM:
                          // this is the number the clinic is meant to notice.
                          data-low={row.margin < MARGIN_ALERT ? 'true' : undefined}
                        >
                          {percent(row.margin)}
                        </td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside aria-label="Parâmetros e reservas">
          {full ? (
            <>
              <div className={styles.card}>
                <div className="kicker">Do lucro do mês</div>
                <h2 className={styles.cardTitle}>Reservas</h2>
                <dl className={styles.definitions}>
                  <dt>Recompra de insumos (10%)</dt>
                  <dd className="num">{currency(split.restock)}</dd>
                  <dt>Emergência (5%)</dt>
                  <dd className="num">{currency(split.emergency)}</dd>
                  <dt className={styles.total}>Retirada</dt>
                  <dd className={`${styles.total} num`}>{currency(split.draw)}</dd>
                </dl>
                <p className={styles.note}>
                  A separação é do lucro líquido do mês, não do faturamento. Com prejuízo no mês,
                  os três números ficam negativos — é a conta dizendo que não há o que reservar.
                </p>
              </div>

              <div className={styles.card}>
                <div className="kicker">Em vigor</div>
                <h2 className={styles.cardTitle}>Parâmetros</h2>
                {params ? (
                  <dl className={styles.definitions}>
                    <dt>Impostos</dt>
                    <dd className="num">{percent(params.taxRate)}</dd>
                    <dt>Maquininha à vista</dt>
                    <dd className="num">{percent(params.cardFeeUpfront)}</dd>
                    <dt>Maquininha parcelado</dt>
                    <dd className="num">{percent(params.cardFeeInstallment)}</dd>
                    <dt>Custos fixos</dt>
                    <dd className="num">{currency(params.fixedMonthlyCosts)}</dd>
                    <dt>Atendimentos previstos</dt>
                    <dd className="num">{params.expectedAppointments}</dd>
                    <dt className={styles.total}>Rateio por atendimento</dt>
                    <dd className={`${styles.total} num`}>{currency(params.overhead)}</dd>
                  </dl>
                ) : (
                  <p className={styles.note}>
                    Nenhum parâmetro salvo ainda. <Link href="/settings">Configure</Link> antes de
                    fechar atendimentos.
                  </p>
                )}
                <p className={styles.note}>
                  Cada lançamento guarda os parâmetros que valiam no dia, então mudar estes números
                  não reescreve o passado.
                </p>
              </div>
            </>
          ) : (
            <div className={styles.card}>
              <div className="kicker">Seu perfil</div>
              <h2 className={styles.cardTitle}>Acesso parcial</h2>
              <p className={styles.note}>
                Seu acesso é parcial: você confere o que foi cobrado e a forma de pagamento, mas
                custo, imposto, lucro e margem não aparecem. É o perfil funcionando como previsto.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
