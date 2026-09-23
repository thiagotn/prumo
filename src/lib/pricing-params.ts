// Loads the tenant's pricing parameters and hands them to the pricing engine as plain
// numbers.
//
// Deliberately not marked `server-only`: it holds no secret, and the operational scripts
// (import-catalog, verification) legitimately read parameters outside a request. That
// guard belongs to the auth modules, where a leak into a client bundle would matter.
//
// The boundary matters: money and rates are stored as Decimal, because a float drifts
// once you start summing charges. The formulas, on the other hand, divide by
// (1 - tax - fee - margin), which has no exact decimal form — so the engine works in
// `number` and rounds once, at the edge. This module is where that conversion happens,
// in one place, rather than scattered through the screens.
import type { Prisma } from '@prisma/client';
import { withTenant, type Tx } from './db';
import { overheadPerAppointment, type PricingParameters } from './pricing';

export type CurrentParams = PricingParameters & {
  id: string;
  validFrom: Date;
  /** Fixed costs spread over one appointment — derived, never stored. */
  overhead: number;
};

function toNumber(value: Prisma.Decimal | number): number {
  return typeof value === 'number' ? value : value.toNumber();
}

/**
 * The parameters in force. Rows are versioned rather than updated, so "current" is the
 * newest one whose validFrom has passed — an old quote can still be re-explained with
 * the numbers that produced it.
 */
export async function currentPricingParams(tx: Tx, tenantId: string): Promise<CurrentParams | null> {
  const row = await tx.pricingParams.findFirst({
    where: { tenantId, validFrom: { lte: new Date() } },
    orderBy: { validFrom: 'desc' },
  });
  if (!row) return null;

  const params: PricingParameters = {
    taxRate: toNumber(row.taxRate),
    cardFeeUpfront: toNumber(row.cardFeeUpfront),
    cardFeeInstallment: toNumber(row.cardFeeInstallment),
    fixedMonthlyCosts: toNumber(row.fixedMonthlyCosts),
    expectedAppointments: row.expectedAppointments,
    defaultMargin: toNumber(row.defaultMargin),
  };

  return { ...params, id: row.id, validFrom: row.validFrom, overhead: overheadPerAppointment(params) };
}

/** Convenience for callers that only have a tenant id. */
export async function pricingParamsFor(tenantId: string): Promise<CurrentParams | null> {
  return withTenant(tenantId, (tx) => currentPricingParams(tx, tenantId));
}
