import type { Metadata } from 'next';
import Link from 'next/link';
import { requireModule } from '@/lib/auth/guards';
import { withTenant } from '@/lib/db';
import {
  currentMonthKey,
  isMonthKey,
  lastMonths,
  monthBounds,
  monthKey,
  monthLabel,
  monthShortLabel,
  summarize,
} from '@/lib/finance';
import { currency, percent } from '@/lib/format';
import { marginBand, MARGIN_BAND_LABELS, type MarginBand } from '@/lib/pricing';
import styles from './reports.module.css';

export const metadata: Metadata = { title: 'Relatórios' };

/** How many months the chart shows (docs/especificacao.md, screen 8). */
const MONTHS = 6;

/** The guidance bands, as `marginBand` splits them. Product copy, pt-BR. */
const BANDS: Array<{ key: MarginBand; range: string }> = [
  { key: 'risk', range: 'abaixo de 15%' },
  { key: 'minimum', range: '15% a 30%' },
  { key: 'target', range: '30% a 40%' },
  { key: 'high', range: 'acima de 40%' },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { tenant } = await requireModule('reports');
  const { month } = await searchParams;
  if (!tenant) return <p className="card-body">Esta tela pertence a uma clínica.</p>;

  const lastMonth = isMonthKey(month) ? month : currentMonthKey();
  const months = lastMonths(MONTHS, lastMonth);
  const range = { from: monthBounds(months[0]!).from, to: monthBounds(lastMonth).to };

  const payments = await withTenant(tenant.id, (tx) =>
    tx.payment.findMany({
      where: { createdAt: { gte: range.from, lt: range.to } },
      orderBy: { createdAt: 'asc' },
      include: {
        encounter: {
          include: {
            product: { select: { brand: true } },
            appointment: { include: { procedure: { select: { name: true } } } },
          },
        },
      },
    }),
  );

  const rows = payments.map((payment) => ({
    month: monthKey(payment.createdAt),
    procedure:
      payment.encounter.appointment?.procedure?.name ??
      payment.encounter.product?.brand ??
      'Sem procedimento',
    charged: Number(payment.charged),
    totalCost: Number(payment.totalCost),
    taxAmount: Number(payment.taxAmount),
    cardFeeAmount: Number(payment.cardFeeAmount),
    netProfit: Number(payment.netProfit),
    hours: payment.encounter.appointment
      ? (payment.encounter.appointment.endsAt.getTime() -
          payment.encounter.appointment.startsAt.getTime()) /
        3_600_000
      : 0,
  }));

  const byMonth = months.map((key) => ({
    key,
    summary: summarize(rows.filter((row) => row.month === key)),
  }));
  const period = summarize(rows);

  // The tallest bar sets the scale. Without a floor, a period with no revenue would
  // divide by zero and every bar would be full height.
  const ceiling = Math.max(...byMonth.map((m) => m.summary.charged), 1);

  const mix = [...rows.reduce((acc, row) => {
    const current = acc.get(row.procedure) ?? { charged: 0, count: 0 };
    acc.set(row.procedure, { charged: current.charged + row.charged, count: current.count + 1 });
    return acc;
  }, new Map<string, { charged: number; count: number }>())]
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.charged - a.charged);
  const mixCeiling = Math.max(...mix.map((line) => line.charged), 1);

  const here = period.count > 0 ? marginBand(period.margin) : null;
  const exportRange = `from=${months[0]}&to=${lastMonth}`;

  return (
    <div>
      <div className={styles.toolbar}>
        <span className="kicker">
          {monthLabel(months[0]!)} — {monthLabel(lastMonth)}
        </span>
        <div className={styles.spacer} />
        <Link className="btn btn-secondary touch" href={`/api/reports/csv?${exportRange}`} style={{ fontSize: 12 }}>
          Exportar CSV
        </Link>
        <Link className="btn btn-secondary touch" href={`/api/reports/pdf?${exportRange}`} style={{ fontSize: 12 }}>
          Exportar PDF
        </Link>
      </div>

      <div className={styles.columns}>
        <div className={styles.card}>
          <div className="card-kicker">Faturamento e lucro</div>
          <h2 className={styles.cardTitle}>Últimos {MONTHS} meses</h2>

          {period.count === 0 ? (
            <p className={styles.empty}>
              Nenhum atendimento fechado neste período. Os números aparecem conforme a ficha de
              atendimento for sendo fechada.
            </p>
          ) : (
            <>
              <div className={styles.chart}>
                {byMonth.map(({ key, summary }) => {
                  const revenueHeight = (summary.charged / ceiling) * 100;
                  const profitHeight = (Math.max(summary.netProfit, 0) / ceiling) * 100;
                  return (
                    <div className={styles.month} key={key}>
                      <span className={`${styles.monthValue} num`}>
                        {summary.charged > 0 ? currency(summary.charged, { cents: false }) : '—'}
                      </span>
                      <div className={styles.bars} style={{ height: `${revenueHeight}%` }}>
                        <div className={styles.barRevenue} />
                        {summary.netProfit < 0 ? (
                          <div className={styles.barLoss} title="Prejuízo no mês" />
                        ) : (
                          <div
                            className={styles.barProfit}
                            style={{
                              height: summary.charged > 0
                                ? `${(profitHeight / revenueHeight) * 100}%`
                                : '0%',
                            }}
                          />
                        )}
                      </div>
                      <span className={styles.monthName}>{monthShortLabel(key)}</span>
                    </div>
                  );
                })}
              </div>

              <div className={styles.legend}>
                <span className={styles.legendItem}>
                  <span className={styles.swatchOutline} />
                  Faturamento
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.swatchSolid} />
                  Lucro líquido
                </span>
              </div>

              <p className={styles.note}>
                No período: {currency(period.charged)} faturados, {currency(period.netProfit)} de
                lucro líquido, margem {percent(period.margin)} em {period.count} atendimento
                {period.count === 1 ? '' : 's'}.
              </p>
            </>
          )}
        </div>

        <div>
          <div className={styles.card}>
            <div className="card-kicker">Mix de procedimentos</div>
            <h2 className={styles.cardTitle}>Receita por linha</h2>
            {mix.length === 0 ? (
              <p className={styles.note}>Nada fechado no período.</p>
            ) : (
              <div className={styles.mix}>
                {mix.map((line) => (
                  <div key={line.name}>
                    <div className={styles.mixLine}>
                      <span>{line.name}</span>
                      <span className={`${styles.mixValue} num`}>
                        {currency(line.charged, { cents: false })} · {line.count}
                      </span>
                    </div>
                    <div className={styles.mixTrack}>
                      <div
                        className={styles.mixFill}
                        style={{ width: `${(line.charged / mixCeiling) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.card}>
            <div className="card-kicker">Guia de margem</div>
            <h2 className={styles.cardTitle}>Onde a clínica está</h2>
            <div style={{ marginTop: 'var(--space-3)' }}>
              {BANDS.map((band) => (
                <div
                  className={`${styles.band} ${here === band.key ? styles.bandHere : ''}`}
                  key={band.key}
                >
                  <span className={`${styles.bandRange} num`}>{band.range}</span>
                  <span>{MARGIN_BAND_LABELS[band.key]}</span>
                </div>
              ))}
            </div>
            <p className={styles.note}>
              {here
                ? `A margem realizada do período é ${percent(period.margin)}.`
                : 'A faixa é marcada quando houver atendimento fechado no período.'}{' '}
              Abaixo de 28% o Financeiro destaca a margem do lançamento.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
