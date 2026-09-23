// Shared helpers for the e2e suite. The users come from prisma/seed.ts.
import { expect, type Page } from '@playwright/test';

export const DEV_PASSWORD = 'prumo1234';

/** Seeded users, by role. See prisma/seed.ts. */
export const USERS = {
  owner: { email: 'owner@dratatimayumi.com.br', name: 'Dra. Tati Mayumi' },
  reception: { email: 'recepcao@dratatimayumi.com.br', name: 'Aline Souza' },
  finance: { email: 'financeiro@dratatimayumi.com.br', name: 'Marcos Ribeiro' },
  practitioner: { email: 'pedro@dratatimayumi.com.br', name: 'Dr. Pedro Lemos' },
  patient: { email: 'renata@exemplo.com.br', name: 'Renata Yamada' },
} as const;

/** Seeded clinics and the dev hostname each answers on. */
export const CLINICS = {
  tati: { host: 'localhost:3100', name: 'Dra. Tati Mayumi', accent: '#b68235' },
  aurora: { host: 'aurora.localhost:3100', name: 'Clínica Aurora', accent: '#7d5411' },
  vertice: { host: 'vertice.localhost:3100', name: 'Vértice Saúde', accent: '#444141' },
} as const;

/** Submits the sign-in form. Does not assert where it lands — each test decides. */
export async function signIn(page: Page, email: string, password = DEV_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Signs in a role that needs no second factor and waits for the app shell. */
export async function signInWithoutTwoFactor(page: Page, email: string) {
  await signIn(page, email);
  await expect(page.getByRole('navigation', { name: 'Módulos' })).toBeVisible();
}

/**
 * The form's error message. Scoped to the <form> on purpose: Next renders its route
 * announcer as role="alert" too, so an unscoped getByRole('alert') is ambiguous.
 */
export function formError(page: Page) {
  return page.locator('form').getByRole('alert');
}

/**
 * The role label in the sidebar footer. Uses a test id because plain text matching is
 * ambiguous — "Financeiro" is both a menu item and a role name.
 */
export function sidebarRoleLabel(page: Page) {
  return page.getByTestId('user-role');
}

/**
 * Base URL for a clinic, using its REAL hostname. Chromium maps *.localhost to the
 * loopback address, so this exercises the actual Host header.
 *
 * Do not fake the host with x-forwarded-host: Next validates a Server Action's Origin
 * against the request Host, and a mismatch makes every form POST fail.
 */
export function clinicUrl(host: string): string {
  return `http://${host}`;
}

/** Sidebar item labels, in order — the role-filtered menu. */
export async function menuLabels(page: Page): Promise<string[]> {
  const nav = page.getByRole('navigation', { name: 'Módulos' });
  return nav.getByRole('link').allInnerTexts();
}
