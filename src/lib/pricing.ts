// Pricing — the formulas from docs/regras-de-negocio.md, which transcribe the clinic's
// spreadsheet. This module is the single place they exist in code.
//
// Two decisions worth stating, because both are easy to get subtly wrong:
//
// 1. **The margin is net.** Both prices already absorb tax and the matching card fee, so
//    the stated margin is what actually survives in the till, whichever way the patient
//    pays. That is why the divisor subtracts all three rates rather than multiplying at
//    the end.
//
// 2. **Money is computed in `number`, rounded only at the edge.** Money is stored as
//    Decimal (floats drift once you sum charges), but the division here is inherently
//    non-terminating — a cost divided by a yield of 1.5, or divided by 0.595 — so there
//    is no exact representation to preserve. Rounding to cents at each step would
//    accumulate error; rounding once, at the end, matches what the spreadsheet shows.

/** Rates as fractions: 0.06 is 6%, exactly as the spreadsheet stores them. */
export type PricingParameters = {
  taxRate: number;
  cardFeeUpfront: number;
  cardFeeInstallment: number;
  fixedMonthlyCosts: number;
  expectedAppointments: number;
  defaultMargin: number;
};

export type CostInput = {
  /** What one purchased unit costs. */
  purchaseCost: number;
  /** How many appointments one purchased unit serves. Toxin yields 1.5. */
  yieldPerUnit: number;
  /** The room's hourly rate. */
  roomHourlyRate: number;
  /** Chair time, in hours. */
  durationHours: number;
  /** Needles, cannulas, gloves, topical anaesthetic, gauze. Varies by procedure. */
  disposablesCost: number;
  /** Fixed costs spread over one appointment. See `overheadPerAppointment`. */
  overheadPerAppointment: number;
};

export type CostBreakdown = {
  material: number;
  room: number;
  disposables: number;
  overhead: number;
  total: number;
};

export type PriceQuote = {
  cost: CostBreakdown;
  margin: number;
  /** Single payment: cash, Pix, debit or credit in one instalment. */
  upfront: number;
  /** Credit in instalments, which carries the higher card fee. */
  installment: number;
  /**
   * Profit on the upfront price — the conservative figure. In dolar terms the profit is
   * the same when paying in instalments, because the extra fee is already inside that
   * price; the patient pays for the instalments, not the clinic.
   */
  profit: number;
  /** Profit per chair hour. Ranks what is worth putting in the diary. */
  profitPerHour: number;
};

/** Fixed costs spread over one appointment: what the spreadsheet calls "rateio". */
export function overheadPerAppointment(params: PricingParameters): number {
  if (params.expectedAppointments <= 0) return 0;
  return params.fixedMonthlyCosts / params.expectedAppointments;
}

/** Material cost for one appointment: what the unit costs, divided by what it serves. */
export function materialCost(purchaseCost: number, yieldPerUnit: number): number {
  if (yieldPerUnit <= 0) {
    throw new Error('yieldPerUnit must be greater than zero');
  }
  return purchaseCost / yieldPerUnit;
}

export function costBreakdown(input: CostInput): CostBreakdown {
  const material = materialCost(input.purchaseCost, input.yieldPerUnit);
  const room = input.roomHourlyRate * input.durationHours;
  const total = material + room + input.disposablesCost + input.overheadPerAppointment;
  return {
    material,
    room,
    disposables: input.disposablesCost,
    overhead: input.overheadPerAppointment,
    total,
  };
}

/**
 * price = total cost / (1 - tax - cardFee - margin)
 *
 * Throws when the rates leave no room: at tax + fee + margin >= 1 there is no price that
 * yields that margin, and the division would return Infinity or a negative number. That
 * is a configuration error, and it should surface at the Settings screen rather than as
 * a nonsensical price on a quote.
 */
export function priceFor(totalCost: number, taxRate: number, cardFee: number, margin: number): number {
  const divisor = 1 - taxRate - cardFee - margin;
  if (divisor <= 0) {
    throw new Error(
      `Impossible pricing: tax (${taxRate}), card fee (${cardFee}) and margin (${margin}) add up to ${(1 - divisor).toFixed(4)}, leaving nothing for the cost.`,
    );
  }
  return totalCost / divisor;
}

/** A full quote: both prices, the cost that produced them, and the profit. */
export function quote(
  input: CostInput,
  params: PricingParameters,
  margin: number = params.defaultMargin,
): PriceQuote {
  const cost = costBreakdown(input);
  const upfront = priceFor(cost.total, params.taxRate, params.cardFeeUpfront, margin);
  const installment = priceFor(cost.total, params.taxRate, params.cardFeeInstallment, margin);

  // The margin is net, so the profit is simply that share of the price.
  const profit = upfront * margin;

  return {
    cost,
    margin,
    upfront,
    installment,
    profit,
    profitPerHour: input.durationHours > 0 ? profit / input.durationHours : 0,
  };
}

/** How a patient paid. Cash and Pix never touch the card machine. */
export type PaymentMethod = 'CASH' | 'PIX' | 'DEBIT' | 'CREDIT_UPFRONT' | 'CREDIT_INSTALLMENT';

/** The card fee that actually applies. Cash and Pix pay none. */
export function cardFeeFor(method: PaymentMethod, params: PricingParameters): number {
  switch (method) {
    case 'CASH':
    case 'PIX':
      return 0;
    case 'DEBIT':
    case 'CREDIT_UPFRONT':
      return params.cardFeeUpfront;
    case 'CREDIT_INSTALLMENT':
      return params.cardFeeInstallment;
  }
}

export type RealizedResult = {
  charged: number;
  totalCost: number;
  tax: number;
  cardFee: number;
  netProfit: number;
  /** Profit over what was charged. Negative when the price was below cost. */
  margin: number;
};

/**
 * What actually happened, once a price was charged. Unlike the quote, this starts from
 * the amount on the receipt: a discount, a package or a courtesy all land here.
 */
export function realized(
  charged: number,
  totalCost: number,
  method: PaymentMethod,
  params: PricingParameters,
): RealizedResult {
  const tax = charged * params.taxRate;
  const cardFee = charged * cardFeeFor(method, params);
  const netProfit = charged - totalCost - tax - cardFee;
  return {
    charged,
    totalCost,
    tax,
    cardFee,
    netProfit,
    margin: charged > 0 ? netProfit / charged : 0,
  };
}

/**
 * Never price below cost (docs/regras-de-negocio.md). Returns why, so the caller can
 * block or ask for confirmation rather than guess.
 */
export function belowCost(price: number, totalCost: number): boolean {
  return price < totalCost;
}

/** Rounds to cents. Apply once, at the edge — never between steps. */
export function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Below this, a realised margin is shown in accent-700 on the Financeiro screen
 * (docs/regras-de-negocio.md). It is not one of the bands below: it is the line the
 * clinic asked to be warned about.
 */
export const MARGIN_ALERT = 0.28;

/** Margin bands from the spreadsheet's guidance tab, used by the reports screen. */
export type MarginBand = 'risk' | 'minimum' | 'target' | 'high';

export function marginBand(margin: number): MarginBand {
  if (margin < 0.15) return 'risk';
  if (margin < 0.3) return 'minimum';
  if (margin <= 0.4) return 'target';
  return 'high';
}

/** Product copy, pt-BR. */
export const MARGIN_BAND_LABELS: Record<MarginBand, string> = {
  risk: 'Zona de risco — qualquer imprevisto consome o lucro',
  minimum: 'Faixa mínima saudável para clínica em crescimento',
  target: 'Faixa-alvo recomendada para injetáveis',
  high: 'Alta — possível em procedimentos de alto valor percebido',
};

/** Reserve split from the spreadsheet: restock, emergency, and what is left to draw. */
export function reserves(netProfit: number): { restock: number; emergency: number; draw: number } {
  const restock = netProfit * 0.1;
  const emergency = netProfit * 0.05;
  return { restock, emergency, draw: netProfit - restock - emergency };
}
