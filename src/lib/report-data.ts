// The data behind the two exports, loaded once and shaped the same way for both — a CSV
// and a PDF of the same period must not be able to disagree.
import 'server-only';
import { withTenant } from './db';
import { isMonthKey, lastMonths, monthBounds, monthKey, summarize } from './finance';

export type ReportLine = {
  at: Date;
  month: string;
  procedure: string;
  product: string;
  method: string;
  installments: number | null;
  charged: number;
  materialCost: number;
  roomCost: number;
  disposablesCost: number;
  overheadCost: number;
  totalCost: number;
  taxAmount: number;
  cardFeeAmount: number;
  netProfit: number;
  margin: number;
  hours: number;
};

export type ReportData = {
  from: string;
  to: string;
  months: string[];
  lines: ReportLine[];
};

/** At most two years per export: a request for more is a mistake, not a report. */
const MAX_MONTHS = 24;

/**
 * Resolves the requested period. Anything unparseable falls back to the six months
 * ending now — an export should produce a report, not an error page.
 */
export function resolvePeriod(from: string | undefined, to: string | undefined, today: string) {
  const end = isMonthKey(to) ? to : today;
  const start = isMonthKey(from) && from <= end ? from : lastMonths(6, end)[0]!;

  const months: string[] = [];
  for (let cursor = start; cursor <= end && months.length < MAX_MONTHS; ) {
    months.push(cursor);
    const [year, index] = cursor.split('-').map(Number) as [number, number];
    const next = new Date(Date.UTC(year, index, 1));
    cursor = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return { from: months[0]!, to: months[months.length - 1]!, months };
}

export async function loadReport(
  tenantId: string,
  period: { from: string; to: string; months: string[] },
): Promise<ReportData> {
  const range = { from: monthBounds(period.from).from, to: monthBounds(period.to).to };

  const payments = await withTenant(tenantId, (tx) =>
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

  const lines: ReportLine[] = payments.map((payment) => {
    const appointment = payment.encounter.appointment;
    return {
      at: payment.createdAt,
      month: monthKey(payment.createdAt),
      procedure: appointment?.procedure?.name ?? 'Sem procedimento',
      product: payment.encounter.product?.brand ?? '',
      method: payment.method,
      installments: payment.installments,
      charged: Number(payment.charged),
      materialCost: Number(payment.materialCost),
      roomCost: Number(payment.roomCost),
      disposablesCost: Number(payment.disposablesCost),
      overheadCost: Number(payment.overheadCost),
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

  return { ...period, lines };
}

/** Per-month totals, in the order the months were asked for. */
export function monthlyTotals(data: ReportData) {
  return data.months.map((month) => ({
    month,
    ...summarize(data.lines.filter((line) => line.month === month)),
  }));
}

/** Revenue by procedure line, biggest first. */
export function procedureMix(data: ReportData) {
  const totals = new Map<string, { charged: number; count: number }>();
  for (const line of data.lines) {
    const current = totals.get(line.procedure) ?? { charged: 0, count: 0 };
    totals.set(line.procedure, { charged: current.charged + line.charged, count: current.count + 1 });
  }
  return [...totals]
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.charged - a.charged);
}
