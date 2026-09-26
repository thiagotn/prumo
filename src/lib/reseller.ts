// The reseller's numbers: what the platform is worth this month and who left.
//
// Free of database and React so the arithmetic can be tested directly. Money here is the
// fee agreed with each clinic, not a price derived from the plan — the plan is what the
// clinic gets, the fee is what it pays, and a discount separates the two.
import { monthKey } from './finance';
import { originFor } from './host';

export type TenantRow = {
  id: string;
  active: boolean;
  monthlyFee: number | null;
  createdAt: Date;
  deactivatedAt: Date | null;
};

export type ResellerSummary = {
  /** Clinics open today. */
  active: number;
  /** Monthly recurring revenue: what the open clinics pay, added up. */
  mrr: number;
  /** Open clinics with no fee recorded — MRR is only as true as this is zero. */
  withoutFee: number;
  /** Clinics that left in the month. */
  lost: number;
  /** Clinics that came in the month. */
  gained: number;
  /** Lost over what was open at the start of the month. Zero when nothing was open. */
  churn: number;
};

export function summarize(
  tenants: TenantRow[],
  month: string,
  timeZone?: string,
): ResellerSummary {
  const open = tenants.filter((tenant) => tenant.active);

  const lost = tenants.filter(
    (tenant) => tenant.deactivatedAt && monthKey(tenant.deactivatedAt, timeZone) === month,
  ).length;
  const gained = tenants.filter((tenant) => monthKey(tenant.createdAt, timeZone) === month).length;

  // Open at the start of the month: what is open now, minus what arrived during it, plus
  // what left during it.
  const atStart = open.length - gained + lost;

  return {
    active: open.length,
    mrr: open.reduce((total, tenant) => total + (tenant.monthlyFee ?? 0), 0),
    withoutFee: open.filter((tenant) => tenant.monthlyFee === null).length,
    lost,
    gained,
    churn: atStart > 0 ? lost / atStart : 0,
  };
}

/** Product copy, pt-BR. Keyed by the Plan enum in prisma/schema.prisma. */
export const PLAN_LABELS: Record<'ESSENTIAL' | 'CLINIC' | 'NETWORK', string> = {
  ESSENTIAL: 'Essencial',
  CLINIC: 'Clínica',
  NETWORK: 'Rede',
};

export const BILLING_LABELS: Record<'ACTIVE' | 'PAST_DUE' | 'TRIAL' | 'SUSPENDED', string> = {
  ACTIVE: 'Em dia',
  PAST_DUE: 'Em atraso',
  TRIAL: 'Em teste',
  SUSPENDED: 'Suspensa',
};

/** Tag class from the design system, per billing status. */
export const BILLING_TAG: Record<'ACTIVE' | 'PAST_DUE' | 'TRIAL' | 'SUSPENDED', string> = {
  ACTIVE: 'tag-neutral',
  PAST_DUE: 'tag-accent',
  TRIAL: 'tag-outline',
  SUSPENDED: 'tag-accent',
};

/** How long an impersonation ticket is good for. Seconds, not minutes: it is spent at once. */
export const HANDOFF_TTL_SECONDS = 60;

export function handoffExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + HANDOFF_TTL_SECONDS * 1000);
}

/**
 * Where a ticket can be spent, and what the reseller is sent to. The host it is minted
 * for comes from `preferredHost` in tenant.ts, which knows the clinic's addresses.
 */
export function enterUrl(host: string, token: string): string {
  return `${originFor(host)}/enter/${token}`;
}
