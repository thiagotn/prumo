// Shared helpers for the e2e suite. The users come from prisma/seed.ts.
import { createHmac } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

export const DEV_PASSWORD = 'prumo1234';

/** Seeded users, by role. See prisma/seed.ts. */
export const USERS = {
  owner: { email: 'owner@dratatimayumi.com.br', name: 'Dra. Tati Mayumi' },
  reception: { email: 'recepcao@dratatimayumi.com.br', name: 'Aline Souza' },
  finance: { email: 'financeiro@dratatimayumi.com.br', name: 'Marcos Ribeiro' },
  practitioner: { email: 'pedro@dratatimayumi.com.br', name: 'Dr. Pedro Lemos' },
  patient: { email: 'renata@exemplo.com.br', name: 'Renata Yamada' },
  // A second clinic's owner. Enrolling a second factor is a one-way step for an account,
  // so specs that need an owner take different ones rather than fighting over the state:
  // two-factor.spec.ts owns Tati's, settings.spec.ts owns Vértice's.
  verticeOwner: { email: 'ivan@verticesaude.com.br', name: 'Dr. Ivan Bertoldo' },
  auroraOwner: { email: 'helena@clinicaaurora.com.br', name: 'Dra. Helena Prado' },
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

// ─────────────────────────────────────────────────────────────────────────────
// TOTP, implemented independently of src/lib/auth/totp.ts on purpose: if the
// application's implementation breaks, these tests have to fail rather than agree
// with it.
// ─────────────────────────────────────────────────────────────────────────────
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of text.toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    value = (value << 5) | BASE32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function totp(secret: string, atMs = Date.now()): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / 30)));
  const h = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1]! & 0x0f;
  const n =
    ((h[o]! & 0x7f) << 24) |
    ((h[o + 1]! & 0xff) << 16) |
    ((h[o + 2]! & 0xff) << 8) |
    (h[o + 3]! & 0xff);
  return String(n % 1e6).padStart(6, '0');
}

/** Secrets enrolled during this run, so later sign-ins can answer the code prompt. */
const enrolledSecrets = new Map<string, string>();

/**
 * Signs in a role that requires a second factor, settling it either way: enrolling the
 * authenticator on a first sign-in, or entering the code when it is already enrolled.
 * Leaves the browser inside the app shell.
 */
export async function signInWithTwoFactor(page: Page, email: string) {
  await signIn(page, email);

  // signIn does not await the redirect, so the URL has to settle before we can tell
  // enrolment from verification. Without this the branch below sees "/login" and falls
  // through, leaving the browser on the 2FA page.
  await page.waitForURL(/\/login\/2fa(\/setup)?$/);

  if (/\/login\/2fa\/setup/.test(page.url())) {
    const secret = (await page.getByLabel('Chave para digitação manual').innerText())
      .replace(/\s+/g, '')
      .trim();
    // Remembered for the rest of the run: after enrolment the app only ever asks for a
    // code, and the stored secret cannot be read back from the page.
    enrolledSecrets.set(email, secret);
    await page.getByLabel('Código do autenticador').fill(totp(secret));
    await page.getByRole('button', { name: /Ativar 2FA/ }).click();
  } else if (/\/login\/2fa/.test(page.url())) {
    // Already enrolled — either by an earlier test in this run, or by a previous run.
    const secret = enrolledSecrets.get(email);
    if (!secret) {
      throw new Error(
        `${email} already has an authenticator enrolled from an earlier run, and the stored ` +
          'secret cannot be read back. Run `npm run db:seed` to clear it.',
      );
    }
    await page.getByLabel('Código do autenticador').fill(totp(secret));
    await page.getByRole('button', { name: 'Confirmar' }).click();
  }

  await expect(page.getByRole('navigation', { name: 'Módulos' })).toBeVisible();
}
