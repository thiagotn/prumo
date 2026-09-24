// The money screens: how a month is delimited, how a set of closings adds up, and how the
// numbers leave the building as a CSV the accountant's Excel can open.
//
// Free of database and React so it can be tested directly. The formulas themselves are in
// pricing.ts — what is here is arithmetic over what was already recorded at closing time,
// never a recalculation: a payment explains itself with the figures stored on it
// (docs/regras-de-negocio.md).
import { CLINIC_TIME_ZONE } from './schedule';

/** One closed encounter, as the ledger reads it. */
export type LedgerRow = {
  charged: number;
  totalCost: number;
  taxAmount: number;
  cardFeeAmount: number;
  netProfit: number;
  /** Chair time, in hours. Drives the profit-per-hour figure. */
  hours: number;
};

export type LedgerSummary = {
  count: number;
  charged: number;
  totalCost: number;
  taxAndFee: number;
  netProfit: number;
  /** Net profit over what was charged. Zero when nothing was charged. */
  margin: number;
  /** Average charge per encounter. */
  ticket: number;
  hours: number;
  /** Net profit per hour of chair time. Zero when no hours were booked. */
  profitPerHour: number;
};

export function summarize(rows: LedgerRow[]): LedgerSummary {
  const total = rows.reduce(
    (acc, row) => ({
      charged: acc.charged + row.charged,
      totalCost: acc.totalCost + row.totalCost,
      taxAndFee: acc.taxAndFee + row.taxAmount + row.cardFeeAmount,
      netProfit: acc.netProfit + row.netProfit,
      hours: acc.hours + row.hours,
    }),
    { charged: 0, totalCost: 0, taxAndFee: 0, netProfit: 0, hours: 0 },
  );

  return {
    count: rows.length,
    ...total,
    margin: total.charged > 0 ? total.netProfit / total.charged : 0,
    ticket: rows.length > 0 ? total.charged / rows.length : 0,
    profitPerHour: total.hours > 0 ? total.netProfit / total.hours : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Months, in the clinic's timezone
// ─────────────────────────────────────────────────────────────────────────────

/** A month as `YYYY-MM`, in the clinic's timezone rather than the server's. */
export function monthKey(date: Date, timeZone = CLINIC_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  return `${year}-${month}`;
}

export function currentMonthKey(timeZone = CLINIC_TIME_ZONE): string {
  return monthKey(new Date(), timeZone);
}

export function isMonthKey(value: string | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Shifts a month key by whole months. */
export function addMonths(month: string, amount: number): string {
  const [year, index] = month.split('-').map(Number) as [number, number];
  const shifted = new Date(Date.UTC(year, index - 1 + amount, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * The instants a month spans, in the clinic's timezone.
 *
 * Done by probing the offset rather than assuming one: a month boundary computed as UTC
 * would pull three hours of the previous month's closings into this one.
 */
export function monthBounds(
  month: string,
  timeZone = CLINIC_TIME_ZONE,
): { from: Date; to: Date } {
  return { from: startOfMonth(month, timeZone), to: startOfMonth(addMonths(month, 1), timeZone) };
}

function startOfMonth(month: string, timeZone: string): Date {
  const [year, index] = month.split('-').map(Number) as [number, number];
  const naive = Date.UTC(year, index - 1, 1, 0, 0, 0);
  const guess = new Date(naive);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(guess);
  const at = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const hour = at('hour') === 24 ? 0 : at('hour');
  const asSeen = Date.UTC(at('year'), at('month') - 1, at('day'), hour, at('minute'));
  return new Date(naive + (naive - asSeen));
}

/** The last `count` months ending at `month`, oldest first — the six bars of the chart. */
export function lastMonths(count: number, month: string): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(month, i - (count - 1)));
}

/** Product copy, pt-BR: "setembro de 2026". */
export function monthLabel(month: string): string {
  const [year, index] = month.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, index - 1, 1)))
    .replace(/^de /, '');
}

/** Three letters for the axis of the six-month chart: "set". */
export function monthShortLabel(month: string): string {
  const [year, index] = month.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, index - 1, 1)))
    .replace('.', '');
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV for the accountant
// ─────────────────────────────────────────────────────────────────────────────

/** A number as Excel pt-BR reads it: comma for decimals, no thousands separator. */
export function csvNumber(value: number, digits = 2): string {
  return value.toFixed(digits).replace('.', ',');
}

/**
 * Builds the CSV.
 *
 * Semicolons, not commas: in a pt-BR locale the comma is the decimal separator, and Excel
 * splits on the semicolon. CRLF and a UTF-8 BOM for the same reason — without the BOM the
 * accents arrive mangled in Excel, which is exactly where this file is opened.
 */
export function toCsv(rows: Array<Array<string | number>>): string {
  const body = rows
    .map((row) => row.map((cell) => csvCell(String(cell))).join(';'))
    .join('\r\n');
  return `﻿${body}\r\n`;
}

function csvCell(value: string): string {
  // A cell holding a separator, a quote or a line break has to be quoted, or the columns
  // shift silently from that row on.
  if (/[";\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** The filename the browser offers. No patient name in it: it lands in a shared folder. */
export function exportFilename(kind: 'csv' | 'pdf', from: string, to: string): string {
  return from === to ? `prumo-${from}.${kind}` : `prumo-${from}_a_${to}.${kind}`;
}
