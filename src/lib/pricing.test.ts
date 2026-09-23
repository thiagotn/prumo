import { describe, expect, it } from 'vitest';
import {
  belowCost,
  cardFeeFor,
  costBreakdown,
  marginBand,
  materialCost,
  overheadPerAppointment,
  priceFor,
  quote,
  realized,
  reserves,
  toCents,
  type PricingParameters,
} from './pricing';

// The clinic's parameters, from docs/regras-de-negocio.md.
const PARAMS: PricingParameters = {
  taxRate: 0.06,
  cardFeeUpfront: 0.045,
  cardFeeInstallment: 0.15,
  fixedMonthlyCosts: 4500,
  expectedAppointments: 40,
  defaultMargin: 0.3,
};

describe('overheadPerAppointment', () => {
  it('spreads the fixed costs over the expected appointments', () => {
    expect(overheadPerAppointment(PARAMS)).toBe(112.5);
  });

  it('returns zero instead of dividing by zero when no appointments are expected', () => {
    expect(overheadPerAppointment({ ...PARAMS, expectedAppointments: 0 })).toBe(0);
  });
});

describe('materialCost', () => {
  it('divides the purchase cost by the yield', () => {
    // A syringe serving one appointment costs what it costs.
    expect(materialCost(435, 1)).toBe(435);
  });

  it('handles the toxin yield of 1.5 — one vial covers a patient and a half', () => {
    expect(materialCost(600, 1.5)).toBe(400);
  });

  it('refuses a zero or negative yield rather than returning Infinity', () => {
    expect(() => materialCost(435, 0)).toThrow(/greater than zero/);
    expect(() => materialCost(435, -1)).toThrow(/greater than zero/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The reference case named in CLAUDE.md: Restylane Kysse in the Tatuapé room.
// These are the numbers the spreadsheet produces, and the contract this module has
// with the clinic's own maths.
// ─────────────────────────────────────────────────────────────────────────────
describe('reference case — Restylane Kysse / Tatuapé', () => {
  const INPUT = {
    purchaseCost: 435, // one 1ml syringe
    yieldPerUnit: 1, // one appointment per syringe
    roomHourlyRate: 77, // Tatuapé
    durationHours: 1,
    disposablesCost: 55, // lip filler
    overheadPerAppointment: 112.5,
  };

  it('breaks the cost down exactly as the spreadsheet does', () => {
    const cost = costBreakdown(INPUT);
    expect(cost.material).toBe(435);
    expect(cost.room).toBe(77);
    expect(cost.disposables).toBe(55);
    expect(cost.overhead).toBe(112.5);
    expect(cost.total).toBe(679.5);
  });

  it('prices at R$ 1.142,02 upfront and R$ 1.386,73 in instalments', () => {
    const result = quote(INPUT, PARAMS);
    expect(toCents(result.upfront)).toBe(1142.02);
    expect(toCents(result.installment)).toBe(1386.73);
  });

  it('keeps full precision before rounding, matching the sheet to four decimals', () => {
    const result = quote(INPUT, PARAMS);
    expect(result.upfront).toBeCloseTo(1142.0168, 4);
    expect(result.installment).toBeCloseTo(1386.7347, 4);
    expect(result.profit).toBeCloseTo(342.605, 3);
    expect(result.profitPerHour).toBeCloseTo(342.605, 3);
  });

  it('leaves exactly the stated margin after tax and the card fee', () => {
    const result = quote(INPUT, PARAMS);
    // Charging the upfront price and paying by debit reproduces the quoted margin.
    const actual = realized(result.upfront, result.cost.total, 'DEBIT', PARAMS);
    expect(actual.margin).toBeCloseTo(0.3, 10);
    expect(actual.netProfit).toBeCloseTo(result.profit, 8);
  });

  it('leaves the same margin when the patient pays in instalments', () => {
    // This is the point of having two prices: the patient covers the extra fee.
    const result = quote(INPUT, PARAMS);
    const actual = realized(result.installment, result.cost.total, 'CREDIT_INSTALLMENT', PARAMS);
    expect(actual.margin).toBeCloseTo(0.3, 10);
  });

  it('earns MORE than the quoted margin on Pix, which pays no card fee', () => {
    const result = quote(INPUT, PARAMS);
    const actual = realized(result.upfront, result.cost.total, 'PIX', PARAMS);
    expect(actual.margin).toBeGreaterThan(0.3);
    // The gain is exactly the card fee that was never paid.
    expect(actual.margin - 0.3).toBeCloseTo(PARAMS.cardFeeUpfront, 10);
  });
});

describe('priceFor', () => {
  it('refuses rates that leave no room for the cost', () => {
    // 6% + 15% + 80% is more than the whole price.
    expect(() => priceFor(100, 0.06, 0.15, 0.8)).toThrow(/Impossible pricing/);
  });

  it('refuses rates that add up to exactly the whole price', () => {
    expect(() => priceFor(100, 0.5, 0.25, 0.25)).toThrow(/Impossible pricing/);
  });

  it('a zero margin prices at cost plus tax and fee only', () => {
    const price = priceFor(100, 0.06, 0.045, 0);
    expect(price).toBeCloseTo(100 / 0.895, 10);
  });
});

describe('cardFeeFor', () => {
  it('charges nothing on cash and Pix', () => {
    expect(cardFeeFor('CASH', PARAMS)).toBe(0);
    expect(cardFeeFor('PIX', PARAMS)).toBe(0);
  });

  it('charges the upfront rate on debit and single-instalment credit', () => {
    expect(cardFeeFor('DEBIT', PARAMS)).toBe(0.045);
    expect(cardFeeFor('CREDIT_UPFRONT', PARAMS)).toBe(0.045);
  });

  it('charges the instalment rate on instalment credit', () => {
    expect(cardFeeFor('CREDIT_INSTALLMENT', PARAMS)).toBe(0.15);
  });
});

describe('realized', () => {
  it('reports a loss when the price was below cost', () => {
    const actual = realized(500, 679.5, 'PIX', PARAMS);
    expect(actual.netProfit).toBeLessThan(0);
    expect(actual.margin).toBeLessThan(0);
  });

  it('a discount comes out of the margin, never out of the cost', () => {
    const full = realized(1142.02, 679.5, 'DEBIT', PARAMS);
    const discounted = realized(1000, 679.5, 'DEBIT', PARAMS);
    expect(discounted.netProfit).toBeLessThan(full.netProfit);
    expect(discounted.totalCost).toBe(full.totalCost);
  });

  it('does not divide by zero on a courtesy appointment', () => {
    const actual = realized(0, 679.5, 'CASH', PARAMS);
    expect(actual.margin).toBe(0);
    expect(actual.netProfit).toBe(-679.5);
  });
});

describe('belowCost', () => {
  it('flags a price under the total cost', () => {
    expect(belowCost(600, 679.5)).toBe(true);
    expect(belowCost(679.5, 679.5)).toBe(false);
    expect(belowCost(700, 679.5)).toBe(false);
  });
});

describe('marginBand', () => {
  it('maps the bands from the spreadsheet guidance', () => {
    expect(marginBand(0.1)).toBe('risk');
    expect(marginBand(0.2)).toBe('minimum');
    expect(marginBand(0.3)).toBe('target');
    expect(marginBand(0.4)).toBe('target');
    expect(marginBand(0.45)).toBe('high');
  });

  it('puts the boundaries where the guidance puts them', () => {
    expect(marginBand(0.1499)).toBe('risk');
    expect(marginBand(0.15)).toBe('minimum');
    expect(marginBand(0.2999)).toBe('minimum');
    expect(marginBand(0.4001)).toBe('high');
  });

  it('treats a loss as the risk band', () => {
    expect(marginBand(-0.1)).toBe('risk');
  });
});

describe('reserves', () => {
  it('splits 10% restock, 5% emergency, the rest to draw', () => {
    const r = reserves(1000);
    expect(r.restock).toBe(100);
    expect(r.emergency).toBe(50);
    expect(r.draw).toBe(850);
  });

  it('the three parts always add back to the whole', () => {
    const r = reserves(342.605);
    expect(r.restock + r.emergency + r.draw).toBeCloseTo(342.605, 10);
  });
});

describe('toCents', () => {
  it('rounds to two decimals', () => {
    expect(toCents(1142.0168)).toBe(1142.02);
    expect(toCents(1386.7347)).toBe(1386.73);
    expect(toCents(0.005)).toBe(0.01);
  });
});
