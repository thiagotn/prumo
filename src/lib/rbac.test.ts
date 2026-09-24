import { Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { MODULES, MODULE_DEFS } from './modules';
import { accessLevel, canAccess, canWrite, initialModule, requiresTwoFactor } from './rbac';

// The "Perfis e permissões" table from docs/especificacao.md, transcribed literally. If the
// code's matrix drifts from it, this test fails — it is the contract with the specification.
const SPEC_TABLE: Array<[string, Role, Record<string, string>]> = [
  [
    'Doutora (owner)',
    Role.OWNER,
    {
      schedule: 'full',
      patients: 'full',
      medicalRecord: 'full',
      photos: 'full',
      finance: 'full',
      inventory: 'full',
      reports: 'full',
      consents: 'full',
      settings: 'full',
    },
  ],
  [
    'Recepção',
    Role.RECEPTION,
    {
      schedule: 'full',
      patients: 'partial',
      medicalRecord: 'none',
      photos: 'none',
      finance: 'partial',
      inventory: 'partial',
      reports: 'none',
      consents: 'full',
      settings: 'none',
    },
  ],
  [
    'Financeiro',
    Role.FINANCE,
    {
      schedule: 'none',
      patients: 'none',
      medicalRecord: 'none',
      photos: 'none',
      finance: 'full',
      inventory: 'full',
      reports: 'full',
      consents: 'none',
      settings: 'none',
    },
  ],
  [
    'Profissional convidado',
    Role.PRACTITIONER,
    {
      schedule: 'own',
      patients: 'own',
      medicalRecord: 'own',
      photos: 'partial',
      finance: 'none',
      inventory: 'none',
      reports: 'none',
      consents: 'full',
      settings: 'none',
    },
  ],
];

describe('permission matrix matches the specification table', () => {
  for (const [label, role, expected] of SPEC_TABLE) {
    for (const [moduleName, level] of Object.entries(expected)) {
      it(`${label} · ${moduleName} -> ${level}`, () => {
        expect(accessLevel(role, moduleName as never)).toBe(level);
      });
    }
  }
});

describe('role boundaries', () => {
  it('no clinic role reaches the reseller panel', () => {
    for (const role of [Role.OWNER, Role.RECEPTION, Role.FINANCE, Role.PRACTITIONER]) {
      expect(canAccess(role, 'tenants')).toBe(false);
    }
  });

  it('the patient reaches only the portal', () => {
    const reached = MODULES.filter((m) => canAccess(Role.PATIENT, m));
    expect(reached).toEqual(['portal']);
  });

  it('the reseller super-admin reaches no medical record and no photos', () => {
    expect(canAccess(Role.SUPERADMIN, 'medicalRecord')).toBe(false);
    expect(canAccess(Role.SUPERADMIN, 'photos')).toBe(false);
    expect(canAccess(Role.SUPERADMIN, 'encounter')).toBe(false);
  });

  it('reception reaches no sensitive module at all', () => {
    const sensitive = MODULES.filter((m) => MODULE_DEFS[m].sensitive);
    expect(sensitive.length).toBeGreaterThan(0);
    for (const sensitiveModule of sensitive) {
      expect(canAccess(Role.RECEPTION, sensitiveModule)).toBe(false);
    }
  });

  it('among the clinic roles, only the owner touches Settings', () => {
    const withSettings = [Role.OWNER, Role.RECEPTION, Role.FINANCE, Role.PRACTITIONER].filter((r) =>
      canAccess(r, 'settings'),
    );
    expect(withSettings).toEqual([Role.OWNER]);
  });
});

describe('who may create and change records', () => {
  it('the front desk registers a patient and books; the owner too', () => {
    for (const role of [Role.OWNER, Role.RECEPTION]) {
      expect(canWrite(role, 'patients')).toBe(true);
      expect(canWrite(role, 'schedule')).toBe(true);
    }
  });

  it('a guest practitioner reads their own diary but does not book into it', () => {
    expect(canAccess(Role.PRACTITIONER, 'schedule')).toBe(true);
    expect(canWrite(Role.PRACTITIONER, 'schedule')).toBe(false);
    expect(canAccess(Role.PRACTITIONER, 'patients')).toBe(true);
    expect(canWrite(Role.PRACTITIONER, 'patients')).toBe(false);
  });

  it('finance never touches the diary or the patient register', () => {
    expect(canWrite(Role.FINANCE, 'schedule')).toBe(false);
    expect(canWrite(Role.FINANCE, 'patients')).toBe(false);
  });

  it('no role writes where it has no access at all', () => {
    for (const role of Object.values(Role)) {
      for (const moduleName of MODULES) {
        if (!canAccess(role, moduleName)) expect(canWrite(role, moduleName)).toBe(false);
      }
    }
  });
});

describe('two-factor requirement', () => {
  it('required for anyone reaching medical records or photos', () => {
    expect(requiresTwoFactor(Role.OWNER)).toBe(true);
    expect(requiresTwoFactor(Role.PRACTITIONER)).toBe(true);
  });

  it('required for the super-admin, who can take over instances', () => {
    expect(requiresTwoFactor(Role.SUPERADMIN)).toBe(true);
  });

  it('not required for reception, finance and patient', () => {
    expect(requiresTwoFactor(Role.RECEPTION)).toBe(false);
    expect(requiresTwoFactor(Role.FINANCE)).toBe(false);
    expect(requiresTwoFactor(Role.PATIENT)).toBe(false);
  });
});

describe('initialModule', () => {
  it('gives every role a screen it can open', () => {
    for (const role of Object.values(Role)) {
      const first = initialModule(role);
      expect(canAccess(role, first)).toBe(true);
      expect(MODULE_DEFS[first].group).toBeDefined();
    }
  });

  it('sends the patient to the portal and the super-admin to the dashboard', () => {
    expect(initialModule(Role.PATIENT)).toBe('portal');
    expect(initialModule(Role.SUPERADMIN)).toBe('dashboard');
  });
});

describe('module catalogue', () => {
  it('every menu route is absolute', () => {
    for (const name of MODULES) {
      if (!MODULE_DEFS[name].group) continue;
      expect(MODULE_DEFS[name].path.startsWith('/')).toBe(true);
    }
  });

  it('the sensitive modules are exactly encounter, medicalRecord and photos', () => {
    expect(MODULES.filter((m) => MODULE_DEFS[m].sensitive).sort()).toEqual([
      'encounter',
      'medicalRecord',
      'photos',
    ]);
  });
});
