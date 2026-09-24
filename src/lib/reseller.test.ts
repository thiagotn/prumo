import { describe, expect, it } from 'vitest';
import {
  enterUrl,
  handoffExpiresAt,
  summarize,
  type TenantRow,
} from './reseller';

const tenant = (overrides: Partial<TenantRow> = {}): TenantRow => ({
  id: Math.random().toString(36).slice(2),
  active: true,
  monthlyFee: 300,
  createdAt: new Date('2025-01-10T12:00:00Z'),
  deactivatedAt: null,
  ...overrides,
});

describe('summarize', () => {
  it('counts what is open and adds up what it pays', () => {
    const summary = summarize(
      [tenant(), tenant({ monthlyFee: 500 }), tenant({ active: false, deactivatedAt: new Date('2026-08-10T12:00:00Z') })],
      '2026-09',
    );
    expect(summary.active).toBe(2);
    expect(summary.mrr).toBe(800);
  });

  it('says how many open clinics have no fee recorded', () => {
    // MRR is only as true as this is zero, and the screen has to be able to say so.
    const summary = summarize([tenant(), tenant({ monthlyFee: null })], '2026-09');
    expect(summary.mrr).toBe(300);
    expect(summary.withoutFee).toBe(1);
  });

  it('counts who left and who arrived in the month', () => {
    const summary = summarize(
      [
        tenant(),
        tenant({ createdAt: new Date('2026-09-03T12:00:00Z') }),
        tenant({ active: false, deactivatedAt: new Date('2026-09-20T12:00:00Z') }),
        tenant({ active: false, deactivatedAt: new Date('2026-07-20T12:00:00Z') }),
      ],
      '2026-09',
    );
    expect(summary.gained).toBe(1);
    expect(summary.lost).toBe(1);
  });

  it('measures churn against what was open when the month started', () => {
    // Two open now, one of which arrived this month, and one left: the month started
    // with two, so churn is one in two.
    const summary = summarize(
      [
        tenant(),
        tenant({ createdAt: new Date('2026-09-03T12:00:00Z') }),
        tenant({ active: false, deactivatedAt: new Date('2026-09-20T12:00:00Z') }),
      ],
      '2026-09',
    );
    expect(summary.churn).toBeCloseTo(0.5, 10);
  });

  it('is all zeros for a platform with no clinics, without dividing by zero', () => {
    expect(summarize([], '2026-09')).toMatchObject({ active: 0, mrr: 0, churn: 0 });
  });

  it('reads the month in the clinic timezone, not the server one', () => {
    // 2026-10-01T02:00Z is still 30 September in São Paulo.
    const summary = summarize(
      [tenant({ active: false, deactivatedAt: new Date('2026-10-01T02:00:00Z') })],
      '2026-09',
    );
    expect(summary.lost).toBe(1);
  });
});

describe('the impersonation ticket', () => {
  it('lives for a minute: it is spent at once', () => {
    const now = new Date('2026-09-24T12:00:00Z');
    expect(handoffExpiresAt(now).toISOString()).toBe('2026-09-24T12:01:00.000Z');
  });

  it('points at the clinic host, over TLS outside development', () => {
    expect(enterUrl('app.clinic.com.br', 'abc')).toBe('https://app.clinic.com.br/enter/abc');
    expect(enterUrl('tati.localhost:3100', 'abc')).toBe('http://tati.localhost:3100/enter/abc');
    expect(enterUrl('localhost:3100', 'abc')).toBe('http://localhost:3100/enter/abc');
  });
});
