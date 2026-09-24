import { describe, expect, it } from 'vitest';
import {
  addMonths,
  csvNumber,
  exportFilename,
  isMonthKey,
  lastMonths,
  monthBounds,
  monthKey,
  monthLabel,
  monthShortLabel,
  summarize,
  toCsv,
  type LedgerRow,
} from './finance';

const row = (overrides: Partial<LedgerRow> = {}): LedgerRow => ({
  charged: 1000,
  totalCost: 500,
  taxAmount: 60,
  cardFeeAmount: 45,
  netProfit: 395,
  hours: 1,
  ...overrides,
});

describe('summarize', () => {
  it('adds up what was recorded, and derives margin, ticket and profit per hour', () => {
    const summary = summarize([row(), row({ charged: 2000, netProfit: 800, hours: 2 })]);

    expect(summary.count).toBe(2);
    expect(summary.charged).toBe(3000);
    expect(summary.totalCost).toBe(1000);
    expect(summary.taxAndFee).toBe(210);
    expect(summary.netProfit).toBe(1195);
    expect(summary.margin).toBeCloseTo(1195 / 3000, 10);
    expect(summary.ticket).toBe(1500);
    expect(summary.profitPerHour).toBeCloseTo(1195 / 3, 10);
  });

  it('is all zeros for a month with no closings, without dividing by zero', () => {
    const summary = summarize([]);
    expect(summary).toMatchObject({ count: 0, charged: 0, margin: 0, ticket: 0, profitPerHour: 0 });
  });

  it('carries a loss through instead of clamping it', () => {
    // Charging below cost is allowed with an explicit confirmation, and the month has to
    // show it (docs/regras-de-negocio.md).
    const summary = summarize([row({ charged: 400, totalCost: 500, netProfit: -160 })]);
    expect(summary.netProfit).toBe(-160);
    expect(summary.margin).toBeCloseTo(-0.4, 10);
  });

  it('ignores hours when nothing was booked, rather than reporting infinity', () => {
    expect(summarize([row({ hours: 0 })]).profitPerHour).toBe(0);
  });
});

describe('month keys', () => {
  it('reads the clinic month, not the server month', () => {
    // 2026-10-01T02:00Z is still 23:00 on 30 September in São Paulo.
    expect(monthKey(new Date('2026-10-01T02:00:00Z'))).toBe('2026-09');
    expect(monthKey(new Date('2026-10-01T03:00:00Z'))).toBe('2026-10');
  });

  it('walks months across the turn of the year', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-09', 0)).toBe('2026-09');
  });

  it('spans the month in the clinic timezone', () => {
    const { from, to } = monthBounds('2026-09');
    // Midnight on 1 September in São Paulo is 03:00 UTC.
    expect(from.toISOString()).toBe('2026-09-01T03:00:00.000Z');
    expect(to.toISOString()).toBe('2026-10-01T03:00:00.000Z');
  });

  it('spans a month in a timezone that observes daylight saving', () => {
    const { from, to } = monthBounds('2026-03', 'Europe/Lisbon');
    expect(from.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    // The clock went forward on 29 March, so April starts an hour earlier in UTC.
    expect(to.toISOString()).toBe('2026-03-31T23:00:00.000Z');
  });

  it('lists the six bars of the chart, oldest first', () => {
    expect(lastMonths(6, '2026-09')).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });

  it('recognises a month key and rejects what is not one', () => {
    expect(isMonthKey('2026-09')).toBe(true);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey('2026-00')).toBe(false);
    expect(isMonthKey('setembro')).toBe(false);
    expect(isMonthKey(undefined)).toBe(false);
  });

  it('labels months in pt-BR', () => {
    expect(monthLabel('2026-09')).toBe('setembro de 2026');
    expect(monthShortLabel('2026-09')).toBe('set');
  });
});

describe('CSV for the accountant', () => {
  it('uses semicolons and comma decimals, which is what Excel pt-BR expects', () => {
    const csv = toCsv([
      ['Data', 'Cobrado'],
      ['24/09/2026', csvNumber(1142.02)],
    ]);
    expect(csv).toContain('Data;Cobrado\r\n');
    expect(csv).toContain('24/09/2026;1142,02');
  });

  it('starts with a BOM, so the accents survive the trip into Excel', () => {
    expect(toCsv([['Procedimento']]).startsWith('﻿')).toBe(true);
  });

  it('quotes a cell that would otherwise shift the columns', () => {
    const csv = toCsv([['Renata; a paciente', 'diz "sim"', 'duas\nlinhas']]);
    expect(csv).toContain('"Renata; a paciente"');
    expect(csv).toContain('"diz ""sim"""');
    expect(csv).toContain('"duas\nlinhas"');
  });

  it('names the file by the period, never by a patient', () => {
    expect(exportFilename('csv', '2026-09', '2026-09')).toBe('prumo-2026-09.csv');
    expect(exportFilename('pdf', '2026-04', '2026-09')).toBe('prumo-2026-04_a_2026-09.pdf');
  });
});
