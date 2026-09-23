// Per-tenant feature flags (Settings screen). Stored in `tenants.enabled_modules`
// (jsonb) and always read through this module, which fills in whatever is missing
// with the default — an existing tenant never breaks when a new flag is introduced.
import type { Flag } from './modules';

export type Flags = Record<Flag, boolean>;

export const DEFAULT_FLAGS: Flags = {
  patientPortal: false,
  clinicalPhotos: true,
  automaticPricing: true,
  automaticStockDeduction: true,
  multiplePractitioners: false,
  multipleUnits: false,
};

/** Product copy, pt-BR. */
export const FLAG_LABELS: Record<Flag, string> = {
  patientPortal: 'Portal da paciente',
  clinicalPhotos: 'Fotos clínicas',
  automaticPricing: 'Precificação automática',
  automaticStockDeduction: 'Baixa automática de estoque',
  multiplePractitioners: 'Múltiplos profissionais e comissão',
  multipleUnits: 'Múltiplas unidades',
};

/** Normalises the jsonb from the database: unknown keys ignored, defaults filled in. */
export function readFlags(raw: unknown): Flags {
  const flags = { ...DEFAULT_FLAGS };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (key in flags && typeof value === 'boolean') {
        flags[key as Flag] = value;
      }
    }
  }
  return flags;
}
