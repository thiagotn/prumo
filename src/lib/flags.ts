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
/** One line saying what each module does, in the words of whoever runs the clinic. */
export const FLAG_NOTES: Record<keyof Flags, string> = {
  patientPortal: 'A paciente entra para confirmar horário, ver orientações e baixar documentos.',
  clinicalPhotos: 'Fotos antes e depois na ficha, em bucket privado e com acesso registrado.',
  automaticPricing: 'Preço sugerido à vista e parcelado calculado a partir dos parâmetros.',
  automaticStockDeduction: 'Fechar o atendimento baixa o lote usado do estoque.',
  multiplePractitioners: 'Mais de um profissional na agenda, com comissão por atendimento.',
  multipleUnits: 'Mais de uma unidade, cada uma com suas salas.',
};

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
