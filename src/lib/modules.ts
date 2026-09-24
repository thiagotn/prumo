// Catalogue of the system's modules: route, label, navigation group and the feature
// flag that turns it on or off per tenant. This is the single source — the sidebar,
// the mobile tab bar and the server guards all read from here.
export const MODULES = [
  'dashboard',
  'schedule',
  'patients',
  'encounter',
  'medicalRecord',
  'photos',
  'finance',
  'inventory',
  'reports',
  'messages',
  'consents',
  'settings',
  'tenants',
  'portal',
  'help',
] as const;

export type Module = (typeof MODULES)[number];

/** Navigation group headings. The labels are product copy, hence pt-BR. */
export type NavGroup = 'Clínica' | 'Gestão' | 'Comunicação' | 'Sistema';

export const NAV_GROUPS: readonly NavGroup[] = ['Clínica', 'Gestão', 'Comunicação', 'Sistema'];

export type Flag =
  | 'patientPortal'
  | 'clinicalPhotos'
  | 'automaticPricing'
  | 'automaticStockDeduction'
  | 'multiplePractitioners'
  | 'multipleUnits';

type ModuleDefinition = {
  path: string;
  /** Sidebar label — product copy, pt-BR. */
  label: string;
  /** Page heading — product copy, pt-BR. */
  title: string;
  /** Kicker above the heading — product copy, pt-BR. */
  crumb: string;
  /** Absent = core module, always present. */
  group?: NavGroup;
  /** When set, the module only shows if the flag is on for the tenant. */
  flag?: Flag;
  /** Module exposes health data: requires 2FA and writes audit_log on open. */
  sensitive?: boolean;
  /** Appears in the mobile tab bar (the care flow). */
  mobile?: boolean;
};

export const MODULE_DEFS: Record<Module, ModuleDefinition> = {
  dashboard: {
    path: '/dashboard',
    label: 'Painel',
    title: 'Painel da clínica',
    crumb: 'Visão geral',
    group: 'Clínica',
    mobile: true,
  },
  schedule: {
    path: '/schedule',
    label: 'Agenda',
    title: 'Agenda',
    crumb: 'Clínica',
    group: 'Clínica',
    mobile: true,
  },
  patients: {
    path: '/patients',
    label: 'Pacientes',
    title: 'Pacientes',
    crumb: 'Clínica',
    group: 'Clínica',
    mobile: true,
  },
  encounter: {
    path: '/encounter',
    label: 'Atendimento',
    title: 'Ficha de atendimento',
    crumb: 'Clínica',
    group: 'Clínica',
    sensitive: true,
    mobile: true,
  },
  // Medical record and photos have no menu entry of their own: they are opened from
  // inside the encounter and the patient panel. They exist in the catalogue because
  // the guards and the audit log check them.
  medicalRecord: {
    // The anamnesis screen. Opened from the patient panel and from the ficha, so it has
    // no menu entry of its own — but the route has to resolve to a module, or the header
    // has nothing to call the page.
    path: '/anamnesis',
    label: 'Prontuário',
    title: 'Prontuário',
    crumb: 'Clínica',
    sensitive: true,
  },
  photos: {
    path: '/encounter',
    label: 'Fotos clínicas',
    title: 'Fotos clínicas',
    crumb: 'Clínica',
    flag: 'clinicalPhotos',
    sensitive: true,
  },
  finance: {
    path: '/finance',
    label: 'Financeiro',
    title: 'Financeiro e caixa',
    crumb: 'Gestão',
    group: 'Gestão',
    mobile: true,
  },
  inventory: {
    path: '/inventory',
    label: 'Estoque',
    title: 'Estoque de insumos',
    crumb: 'Gestão',
    group: 'Gestão',
  },
  reports: {
    path: '/reports',
    label: 'Relatórios',
    title: 'Relatórios',
    crumb: 'Gestão',
    group: 'Gestão',
  },
  messages: {
    path: '/messages',
    label: 'Mensagens',
    title: 'Mensagens e lembretes',
    crumb: 'Comunicação',
    group: 'Comunicação',
  },
  consents: {
    path: '/consents',
    label: 'Termos',
    title: 'Termos de consentimento',
    crumb: 'Comunicação',
    group: 'Comunicação',
  },
  settings: {
    path: '/settings',
    label: 'Configurações',
    title: 'Configurações da instância',
    crumb: 'Sistema',
    group: 'Sistema',
  },
  tenants: {
    path: '/tenants',
    label: 'Tenants',
    title: 'Clínicas na plataforma',
    crumb: 'Plataforma',
    group: 'Sistema',
  },
  help: {
    path: '/help',
    label: 'Ajuda',
    title: 'Ajuda',
    crumb: 'Sistema',
    group: 'Sistema',
  },
  portal: {
    path: '/portal',
    label: 'Meu portal',
    title: 'Minha área',
    crumb: 'Portal da paciente',
    group: 'Clínica',
    flag: 'patientPortal',
    mobile: true,
  },
};

/** The module that owns a path, for the layout guard and the menu highlight. */
export function moduleFromPath(pathname: string): Module | null {
  const candidates = MODULES.filter(
    (m) => pathname === MODULE_DEFS[m].path || pathname.startsWith(`${MODULE_DEFS[m].path}/`),
  );
  // medicalRecord and photos share a path with patients/encounter; the menu module is
  // the one that has a `group`. Sensitive ones are checked explicitly in code.
  return candidates.find((m) => MODULE_DEFS[m].group !== undefined) ?? candidates[0] ?? null;
}
