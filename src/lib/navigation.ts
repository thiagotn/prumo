// Builds the sidebar and the mobile tab bar from the permission matrix and the
// tenant's feature flags. The menu only HIDES; the guards are what block.
import type { Role } from '@prisma/client';
import type { Flags } from './flags';
import { MODULE_DEFS, MODULES, NAV_GROUPS, type Module, type NavGroup } from './modules';
import { canAccess } from './rbac';

export type NavItem = {
  module: Module;
  label: string;
  path: string;
};

export type NavSection = {
  group: NavGroup;
  items: NavItem[];
};

function visible(role: Role, flags: Flags | null, module: Module): boolean {
  const def = MODULE_DEFS[module];
  if (!def.group) return false; // medicalRecord/photos have no menu entry of their own
  if (!canAccess(role, module)) return false;
  if (def.flag) return flags?.[def.flag] === true;
  return true;
}

export function buildNavigation(role: Role, flags: Flags | null): NavSection[] {
  return NAV_GROUPS.map((group) => ({
    group,
    items: MODULES.filter((m) => MODULE_DEFS[m].group === group && visible(role, flags, m)).map(
      (m) => ({ module: m, label: MODULE_DEFS[m].label, path: MODULE_DEFS[m].path }),
    ),
  })).filter((section) => section.items.length > 0);
}

/**
 * Mobile tab bar: at most five destinations from the care flow, in catalogue order.
 * Management modules stay out — on a phone they open read-only from the menu.
 */
export function mobileItems(role: Role, flags: Flags | null): NavItem[] {
  return MODULES.filter((m) => MODULE_DEFS[m].mobile && visible(role, flags, m))
    .slice(0, 5)
    .map((m) => ({ module: m, label: MODULE_DEFS[m].label, path: MODULE_DEFS[m].path }));
}
