// Stock by lot. The clinic has to know which batch went into which patient — an expiry,
// a recall or a reaction all begin with that question — so quantities live per lot rather
// than as one number per product.

/** How many days ahead counts as "expiring soon" in the stock list. */
export const EXPIRY_WARNING_DAYS = 90;

/** Below this many units, a product is flagged as running low. */
export const LOW_STOCK_THRESHOLD = 2;

/**
 * What the stock entry form sends when the brand is not in the catalogue yet. Lives here
 * rather than beside the action because a "use server" file may only export async
 * functions, and both the form and the action need to agree on it.
 */
export const NEW_PRODUCT = 'new';

export type LotLike = {
  quantityRemaining: number;
  expiresAt: Date | null;
};

/**
 * `expired` and `out` come first deliberately: a lot past its date is unusable however
 * many units are left, and the list has to say so rather than showing it as healthy stock.
 */
export type StockStatus = 'expired' | 'out' | 'expiring' | 'low' | 'ok';

export function lotStatus(lot: LotLike, now: Date = new Date()): StockStatus {
  if (lot.expiresAt && lot.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (lot.quantityRemaining <= 0) return 'out';
  if (lot.expiresAt) {
    const daysLeft = (lot.expiresAt.getTime() - now.getTime()) / 86_400_000;
    if (daysLeft <= EXPIRY_WARNING_DAYS) return 'expiring';
  }
  if (lot.quantityRemaining <= LOW_STOCK_THRESHOLD) return 'low';
  return 'ok';
}

/** Product copy, pt-BR. */
export const STATUS_LABELS: Record<StockStatus, string> = {
  expired: 'Vencido',
  out: 'Repor',
  expiring: 'Vence',
  low: 'Baixo',
  ok: 'OK',
};

export const STATUS_TAG: Record<StockStatus, string> = {
  expired: 'tag-accent',
  out: 'tag-accent',
  expiring: 'tag-accent',
  low: 'tag-outline',
  ok: 'tag-neutral',
};

/**
 * Picks the lot to consume: the one expiring soonest among those with stock left, so the
 * clinic burns what would otherwise be thrown away. An expired lot is never chosen — it
 * has to be written off, not used.
 */
export function lotToConsume<T extends LotLike & { id: string; receivedAt?: Date }>(
  lots: T[],
  now: Date = new Date(),
): T | null {
  const usable = lots.filter((lot) => lot.quantityRemaining > 0 && lotStatus(lot, now) !== 'expired');
  if (usable.length === 0) return null;

  return usable.reduce((best, lot) => {
    // A lot with no expiry date is only preferred over one that has some life left if it
    // arrived earlier; between two dated lots, the earlier date wins.
    if (!best.expiresAt && !lot.expiresAt) {
      return (lot.receivedAt?.getTime() ?? 0) < (best.receivedAt?.getTime() ?? 0) ? lot : best;
    }
    if (!best.expiresAt) return lot;
    if (!lot.expiresAt) return best;
    return lot.expiresAt < best.expiresAt ? lot : best;
  });
}

/** Total units left of a product across its lots, ignoring expired ones. */
export function usableQuantity(lots: LotLike[], now: Date = new Date()): number {
  return lots
    .filter((lot) => lotStatus(lot, now) !== 'expired')
    .reduce((total, lot) => total + Math.max(0, lot.quantityRemaining), 0);
}

/** The worst status among a product's lots — what the product row should show. */
export function productStatus(lots: LotLike[], now: Date = new Date()): StockStatus {
  if (lots.length === 0) return 'out';
  const usable = usableQuantity(lots, now);
  if (usable <= 0) return 'out';

  const statuses = lots.filter((l) => l.quantityRemaining > 0).map((l) => lotStatus(l, now));
  if (statuses.includes('expiring')) return 'expiring';
  if (usable <= LOW_STOCK_THRESHOLD) return 'low';
  return 'ok';
}

export type ConsumeResult =
  | { ok: true; lotId: string; remainingAfter: number }
  | { ok: false; reason: 'no-stock' | 'not-enough'; available: number };

/**
 * Works out which lot to draw from and what would be left, without touching the database.
 * The caller performs the write inside a transaction — this part is pure so the decision
 * can be tested on its own.
 */
export function planConsumption<T extends LotLike & { id: string; receivedAt?: Date }>(
  lots: T[],
  quantity: number,
  now: Date = new Date(),
): ConsumeResult {
  const available = usableQuantity(lots, now);
  if (available <= 0) return { ok: false, reason: 'no-stock', available: 0 };
  if (quantity > available) return { ok: false, reason: 'not-enough', available };

  const lot = lotToConsume(lots, now);
  if (!lot) return { ok: false, reason: 'no-stock', available: 0 };
  // A single appointment draws from one lot: mixing batches in one patient would make the
  // traceability the lot numbers exist for meaningless.
  if (lot.quantityRemaining < quantity) return { ok: false, reason: 'not-enough', available };

  return { ok: true, lotId: lot.id, remainingAfter: lot.quantityRemaining - quantity };
}
