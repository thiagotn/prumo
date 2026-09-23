import { describe, expect, it } from 'vitest';
import {
  EXPIRY_WARNING_DAYS,
  lotStatus,
  lotToConsume,
  planConsumption,
  productStatus,
  usableQuantity,
} from './stock';

const NOW = new Date('2026-09-23T12:00:00Z');
const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

describe('lotStatus', () => {
  it('healthy stock with a distant expiry is ok', () => {
    expect(lotStatus({ quantityRemaining: 5, expiresAt: inDays(365) }, NOW)).toBe('ok');
  });

  it('flags a lot that is running low', () => {
    expect(lotStatus({ quantityRemaining: 2, expiresAt: inDays(365) }, NOW)).toBe('low');
  });

  it('flags a lot nearing its expiry', () => {
    expect(lotStatus({ quantityRemaining: 5, expiresAt: inDays(30) }, NOW)).toBe('expiring');
    expect(lotStatus({ quantityRemaining: 5, expiresAt: inDays(EXPIRY_WARNING_DAYS - 1) }, NOW)).toBe(
      'expiring',
    );
  });

  it('an expired lot is expired however much is left', () => {
    expect(lotStatus({ quantityRemaining: 99, expiresAt: inDays(-1) }, NOW)).toBe('expired');
  });

  it('expiry outranks running low', () => {
    expect(lotStatus({ quantityRemaining: 1, expiresAt: inDays(-1) }, NOW)).toBe('expired');
  });

  it('an empty lot needs restocking', () => {
    expect(lotStatus({ quantityRemaining: 0, expiresAt: inDays(365) }, NOW)).toBe('out');
  });

  it('a lot with no expiry date is judged on quantity alone', () => {
    expect(lotStatus({ quantityRemaining: 10, expiresAt: null }, NOW)).toBe('ok');
    expect(lotStatus({ quantityRemaining: 1, expiresAt: null }, NOW)).toBe('low');
  });
});

describe('usableQuantity', () => {
  it('sums what is left, ignoring expired lots', () => {
    expect(
      usableQuantity(
        [
          { quantityRemaining: 3, expiresAt: inDays(365) },
          { quantityRemaining: 5, expiresAt: inDays(-1) }, // expired: does not count
          { quantityRemaining: 2, expiresAt: null },
        ],
        NOW,
      ),
    ).toBe(5);
  });

  it('is zero with no lots at all', () => {
    expect(usableQuantity([], NOW)).toBe(0);
  });
});

describe('lotToConsume', () => {
  it('draws from the lot expiring soonest, so nothing is wasted', () => {
    const chosen = lotToConsume(
      [
        { id: 'later', quantityRemaining: 5, expiresAt: inDays(300) },
        { id: 'sooner', quantityRemaining: 5, expiresAt: inDays(40) },
      ],
      NOW,
    );
    expect(chosen?.id).toBe('sooner');
  });

  it('never picks an expired lot, even when it is the only one with units', () => {
    const chosen = lotToConsume([{ id: 'dead', quantityRemaining: 9, expiresAt: inDays(-1) }], NOW);
    expect(chosen).toBeNull();
  });

  it('skips empty lots', () => {
    const chosen = lotToConsume(
      [
        { id: 'empty', quantityRemaining: 0, expiresAt: inDays(10) },
        { id: 'full', quantityRemaining: 3, expiresAt: inDays(300) },
      ],
      NOW,
    );
    expect(chosen?.id).toBe('full');
  });

  it('between undated lots, takes the one that arrived first', () => {
    const chosen = lotToConsume(
      [
        { id: 'newer', quantityRemaining: 5, expiresAt: null, receivedAt: inDays(-10) },
        { id: 'older', quantityRemaining: 5, expiresAt: null, receivedAt: inDays(-100) },
      ],
      NOW,
    );
    expect(chosen?.id).toBe('older');
  });

  it('prefers a dated lot over an undated one, since the dated one can be lost', () => {
    const chosen = lotToConsume(
      [
        { id: 'undated', quantityRemaining: 5, expiresAt: null },
        { id: 'dated', quantityRemaining: 5, expiresAt: inDays(200) },
      ],
      NOW,
    );
    expect(chosen?.id).toBe('dated');
  });
});

describe('productStatus', () => {
  it('a product with no lots needs restocking', () => {
    expect(productStatus([], NOW)).toBe('out');
  });

  it('a product whose only lot expired needs restocking', () => {
    expect(productStatus([{ quantityRemaining: 5, expiresAt: inDays(-1) }], NOW)).toBe('out');
  });

  it('surfaces an expiring lot even when there is plenty in total', () => {
    expect(
      productStatus(
        [
          { quantityRemaining: 10, expiresAt: inDays(400) },
          { quantityRemaining: 1, expiresAt: inDays(20) },
        ],
        NOW,
      ),
    ).toBe('expiring');
  });

  it('is low when the total across lots is low', () => {
    expect(
      productStatus(
        [
          { quantityRemaining: 1, expiresAt: inDays(400) },
          { quantityRemaining: 1, expiresAt: inDays(500) },
        ],
        NOW,
      ),
    ).toBe('low');
  });
});

describe('planConsumption', () => {
  const lots = [
    { id: 'sooner', quantityRemaining: 2, expiresAt: inDays(40) },
    { id: 'later', quantityRemaining: 5, expiresAt: inDays(300) },
  ];

  it('plans a draw from the lot expiring soonest', () => {
    const plan = planConsumption(lots, 1, NOW);
    expect(plan).toEqual({ ok: true, lotId: 'sooner', remainingAfter: 1 });
  });

  it('refuses when nothing usable is left', () => {
    const plan = planConsumption([{ id: 'dead', quantityRemaining: 3, expiresAt: inDays(-1) }], 1, NOW);
    expect(plan).toEqual({ ok: false, reason: 'no-stock', available: 0 });
  });

  it('refuses when the total is short, and says how much there is', () => {
    const plan = planConsumption(lots, 99, NOW);
    expect(plan).toEqual({ ok: false, reason: 'not-enough', available: 7 });
  });

  it('refuses to split one appointment across two lots', () => {
    // 3 units exist in total across the chosen lot and another, but taking them from two
    // batches would destroy the traceability the lot numbers exist for.
    const plan = planConsumption(lots, 3, NOW);
    expect(plan).toEqual({ ok: false, reason: 'not-enough', available: 7 });
  });

  it('allows draining a lot exactly to zero', () => {
    const plan = planConsumption(lots, 2, NOW);
    expect(plan).toEqual({ ok: true, lotId: 'sooner', remainingAfter: 0 });
  });
});
