import { describe, expect, it } from 'vitest';
import { currency, monogram, percent, shortDate, shortName } from './format';

// The pt-BR thousands separator in ICU is a narrow no-break space (U+00A0 or U+202F
// depending on the build); normalise before comparing.
const normal = (s: string) => s.replace(/[  ]/g, ' ');

describe('currency', () => {
  it('formats as pt-BR BRL', () => {
    expect(normal(currency(1142.02))).toBe('R$ 1.142,02');
    expect(normal(currency(1386.73))).toBe('R$ 1.386,73');
  });

  it('drops the cents when asked (KPIs)', () => {
    expect(normal(currency(37024, { cents: false }))).toBe('R$ 37.024');
  });

  it('formats zero and negatives', () => {
    expect(normal(currency(0))).toBe('R$ 0,00');
    expect(normal(currency(-112.5))).toBe('-R$ 112,50');
  });
});

describe('percent', () => {
  it('formats a margin with one decimal', () => {
    expect(normal(percent(0.301))).toBe('30,1%');
    expect(normal(percent(0.28, 0))).toBe('28%');
  });
});

describe('shortDate', () => {
  it('uses day/month', () => {
    expect(shortDate(new Date(2026, 8, 23))).toBe('23/09');
  });
});

describe('shortName and monogram', () => {
  it('shortens to first name plus initial', () => {
    expect(shortName('Renata Yamada')).toBe('Renata Y.');
    expect(shortName('Ana Beatriz Moura')).toBe('Ana M.');
    expect(shortName('Aline')).toBe('Aline');
  });

  it('builds a two-letter monogram', () => {
    expect(monogram('Tati Mayumi')).toBe('TM');
    expect(monogram('Clínica Aurora')).toBe('CA');
    expect(monogram('Ana Beatriz Moura')).toBe('AB');
  });

  it('skips Portuguese connectives in the name', () => {
    expect(monogram('Maria das Dores Silva')).toBe('MD');
  });

  it('copes with a short single-word name', () => {
    expect(monogram('Li')).toBe('LI');
  });
});
