import { describe, expect, it } from 'vitest';
import { resolvePeriod } from './report-data';

// The period comes from a query string, which anyone can type.
describe('resolvePeriod', () => {
  it('takes the months asked for', () => {
    expect(resolvePeriod('2026-04', '2026-06', '2026-09')).toEqual({
      from: '2026-04',
      to: '2026-06',
      months: ['2026-04', '2026-05', '2026-06'],
    });
  });

  it('falls back to the last six months when the range makes no sense', () => {
    // An export should produce a report, not an error page.
    const period = resolvePeriod('setembro', undefined, '2026-09');
    expect(period.from).toBe('2026-04');
    expect(period.to).toBe('2026-09');
    expect(period.months).toHaveLength(6);
  });

  it('ignores a start after the end', () => {
    expect(resolvePeriod('2026-09', '2026-04', '2026-09').from).toBe('2025-11');
  });

  it('crosses the turn of the year', () => {
    expect(resolvePeriod('2025-11', '2026-02', '2026-09').months).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('caps a request for a decade at two years', () => {
    const period = resolvePeriod('2016-01', '2026-09', '2026-09');
    expect(period.months).toHaveLength(24);
    expect(period.from).toBe('2016-01');
    expect(period.to).toBe('2017-12');
  });
});
