// The module x role permission matrix — transcribed from the "Perfis e permissões" table
// in docs/especificacao.md. It is the source of truth: the menu hides what it denies, but the
// thing that actually DENIES is the server guard (src/lib/auth/guards.ts). Hiding a
// menu item is not a permission (CLAUDE.md).
import { Role } from '@prisma/client';
import { MODULE_DEFS, MODULES, type Module } from './modules';

/**
 *  full    — complete access to the module
 *  partial — limited access (e.g. reception records payments but sees no margin)
 *  own     — only records tied to this practitioner
 *  none    — module hidden and blocked
 */
export type AccessLevel = 'full' | 'partial' | 'own' | 'none';

type MatrixRow = Record<Module, AccessLevel>;

function row(overrides: Partial<MatrixRow>): MatrixRow {
  const base = Object.fromEntries(MODULES.map((m) => [m, 'none'])) as MatrixRow;
  return { ...base, ...overrides };
}

export const ACCESS_MATRIX: Record<Role, MatrixRow> = {
  // The owning doctor: everything clinical. The reseller panel is not hers.
  [Role.OWNER]: row({
    dashboard: 'full',
    schedule: 'full',
    patients: 'full',
    encounter: 'full',
    medicalRecord: 'full',
    photos: 'full',
    finance: 'full',
    inventory: 'full',
    reports: 'full',
    messages: 'full',
    consents: 'full',
    settings: 'full',
  }),

  // Reception: schedule and contact. Never anamnesis or clinical photos.
  [Role.RECEPTION]: row({
    dashboard: 'full',
    schedule: 'full',
    patients: 'partial',
    finance: 'partial', // records payments, sees no cost or margin
    inventory: 'partial',
    messages: 'full',
    consents: 'full',
  }),

  // Finance: numbers and supplies, no clinical data at all.
  [Role.FINANCE]: row({
    dashboard: 'full',
    finance: 'full',
    inventory: 'full',
    reports: 'full',
  }),

  // Guest practitioner: only their own patients.
  [Role.PRACTITIONER]: row({
    dashboard: 'full',
    schedule: 'own',
    patients: 'own',
    encounter: 'own',
    medicalRecord: 'own',
    photos: 'partial',
    consents: 'full',
  }),

  // The reseller's super-admin: platform, not clinic. Medical records stay masked even
  // while impersonating (Session.medicalRecordUnlocked).
  [Role.SUPERADMIN]: row({
    dashboard: 'full',
    tenants: 'full',
    settings: 'full',
  }),

  // Patient: only her own portal.
  [Role.PATIENT]: row({
    portal: 'full',
  }),
};

export function accessLevel(role: Role, module: Module): AccessLevel {
  return ACCESS_MATRIX[role][module];
}

export function canAccess(role: Role, module: Module): boolean {
  return accessLevel(role, module) !== 'none';
}

/** True if the role reaches any module holding health data. */
export function reachesSensitiveData(role: Role): boolean {
  return MODULES.some((m) => MODULE_DEFS[m].sensitive && canAccess(role, m));
}

/**
 * 2FA is mandatory for roles that reach medical records (docs/especificacao.md). The reseller's
 * SUPERADMIN needs it too — they can take over entire instances.
 */
export function requiresTwoFactor(role: Role): boolean {
  return reachesSensitiveData(role) || role === Role.SUPERADMIN;
}

/** Product copy, pt-BR. */
export const ROLE_LABELS: Record<Role, string> = {
  [Role.OWNER]: 'Doutora (owner)',
  [Role.RECEPTION]: 'Recepção / secretária',
  [Role.FINANCE]: 'Financeiro',
  [Role.PRACTITIONER]: 'Profissional convidado',
  [Role.SUPERADMIN]: 'Super-admin da revenda',
  [Role.PATIENT]: 'Paciente (portal)',
};

/** First permitted screen — where login lands and where a denied access redirects. */
export function initialModule(role: Role): Module {
  const first = MODULES.find((m) => MODULE_DEFS[m].group && canAccess(role, m));
  if (!first) throw new Error(`Role ${role} reaches no module`);
  return first;
}
