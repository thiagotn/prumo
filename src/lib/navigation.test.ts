import { Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FLAGS, readFlags, type Flags } from './flags';
import { buildNavigation, mobileItems } from './navigation';

const flags = (overrides: Partial<Flags> = {}): Flags => ({ ...DEFAULT_FLAGS, ...overrides });

function labels(role: Role, f: Flags | null) {
  return buildNavigation(role, f).flatMap((section) => section.items.map((i) => i.label));
}

describe('buildNavigation', () => {
  it('the owner sees all four groups, without the reseller panel', () => {
    const sections = buildNavigation(Role.OWNER, flags());
    expect(sections.map((s) => s.group)).toEqual(['Clínica', 'Gestão', 'Comunicação', 'Sistema']);
    expect(labels(Role.OWNER, flags())).not.toContain('Tenants');
  });

  it('reception sees neither Relatórios nor Configurações', () => {
    const items = labels(Role.RECEPTION, flags({ messageAutomation: true }));
    expect(items).toContain('Agenda');
    expect(items).toContain('Mensagens');
    expect(items).not.toContain('Relatórios');
    expect(items).not.toContain('Configurações');
  });

  it('finance sees only the numbers — plus the help, which everyone has', () => {
    expect(labels(Role.FINANCE, flags())).toEqual([
      'Painel',
      'Financeiro',
      'Estoque',
      'Relatórios',
      'Ajuda',
    ]);
  });

  it('Mensagens só existe para a clínica que usa comunicação automática', () => {
    // O padrão é desligado: clínica que fala com a paciente pessoalmente não precisa
    // conviver com uma tela avisando que o WhatsApp não está conectado.
    expect(labels(Role.OWNER, flags())).not.toContain('Mensagens');
    expect(labels(Role.OWNER, flags({ messageAutomation: true }))).toContain('Mensagens');
  });

  it('empty groups do not appear', () => {
    const sections = buildNavigation(Role.FINANCE, flags());
    // Sistema shows up for every staff role now, because Ajuda lives there.
    expect(sections.map((s) => s.group)).toEqual(['Clínica', 'Gestão', 'Sistema']);
    expect(sections.every((s) => s.items.length > 0)).toBe(true);
  });

  it('every profile that works in the clinic can reach the help', () => {
    for (const role of [Role.OWNER, Role.RECEPTION, Role.FINANCE, Role.PRACTITIONER]) {
      expect(labels(role, flags()), role).toContain('Ajuda');
    }
    // The patient has her own language in the portal; the FAQ is written for the clinic.
    expect(labels(Role.PATIENT, flags({ patientPortal: true }))).not.toContain('Ajuda');
  });

  it('medical record and photos have no menu entry of their own', () => {
    const items = labels(Role.OWNER, flags({ clinicalPhotos: true }));
    expect(items).not.toContain('Prontuário');
    expect(items).not.toContain('Fotos clínicas');
  });

  it("the tenant's flag hides the patient portal", () => {
    expect(labels(Role.PATIENT, flags({ patientPortal: false }))).toEqual([]);
    expect(labels(Role.PATIENT, flags({ patientPortal: true }))).toEqual(['Meu portal']);
  });

  it('with no tenant (platform host) only flag-free modules remain', () => {
    expect(labels(Role.SUPERADMIN, null)).toEqual([
      'Painel',
      'Configurações',
      'Tenants',
      'Ajuda',
    ]);
  });
});

describe('mobileItems', () => {
  it('fits in five destinations', () => {
    for (const role of Object.values(Role)) {
      expect(mobileItems(role, flags()).length).toBeLessThanOrEqual(5);
    }
  });

  it('for the owner, it is the care flow', () => {
    expect(mobileItems(Role.OWNER, flags()).map((i) => i.label)).toEqual([
      'Painel',
      'Agenda',
      'Pacientes',
      'Atendimento',
      'Financeiro',
    ]);
  });

  it('never offers a destination the role cannot open', () => {
    const items = mobileItems(Role.RECEPTION, flags());
    expect(items.map((i) => i.label)).not.toContain('Atendimento');
  });
});

describe('readFlags', () => {
  it('fills the gaps with the defaults', () => {
    expect(readFlags({ patientPortal: true })).toEqual({ ...DEFAULT_FLAGS, patientPortal: true });
  });

  it('ignores unknown keys and wrong types', () => {
    expect(readFlags({ invented: true, clinicalPhotos: 'sim' })).toEqual(DEFAULT_FLAGS);
  });

  it('copes with null, array and string coming out of the jsonb', () => {
    expect(readFlags(null)).toEqual(DEFAULT_FLAGS);
    expect(readFlags([1, 2])).toEqual(DEFAULT_FLAGS);
    expect(readFlags('{}')).toEqual(DEFAULT_FLAGS);
  });
});
