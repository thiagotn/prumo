import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { USERS, formError, signIn, sidebarRoleLabel } from './fixtures';

// A minimal TOTP generator, independent of the application code on purpose: if
// src/lib/auth/totp.ts ever breaks, this test has to fail rather than agree with it.
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

function totp(secret: string, atMs = Date.now()): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / 30)));
  const h = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1]! & 0x0f;
  const n =
    ((h[o]! & 0x7f) << 24) | ((h[o + 1]! & 0xff) << 16) | ((h[o + 2]! & 0xff) << 8) | (h[o + 3]! & 0xff);
  return String(n % 1e6).padStart(6, '0');
}

test.describe('two-factor authentication', () => {
  test('a role reaching medical records must enrol 2FA before entering', async ({ page }) => {
    await signIn(page, USERS.owner.email);

    // The owner reaches medical records, so the shell stays closed until the second factor.
    await expect(page).toHaveURL(/\/login\/2fa\/setup$/);
    await expect(page.getByRole('heading', { name: /verificação em duas etapas/i })).toBeVisible();
    await expect(page.getByLabel(/QR code/)).toBeVisible();

    // Trying to jump straight into the app bounces back to the 2FA step.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\/2fa/);
  });

  test('a wrong code is refused, the right one completes the sign-in', async ({ page }) => {
    await signIn(page, USERS.owner.email);
    await expect(page).toHaveURL(/\/login\/2fa\/setup$/);

    // The page shows the same secret it stored, grouped in fours for manual entry.
    const shownSecret = (await page.getByLabel('Chave para digitação manual').innerText())
      .replace(/\s+/g, '')
      .trim();
    expect(shownSecret).toHaveLength(32);

    await page.getByLabel('Código do autenticador').fill('000000');
    await page.getByRole('button', { name: /Ativar 2FA/ }).click();
    await expect(formError(page)).toContainText('Código incorreto');

    await page.getByLabel('Código do autenticador').fill(totp(shownSecret));
    await page.getByRole('button', { name: /Ativar 2FA/ }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(sidebarRoleLabel(page)).toHaveText('Doutora (owner)');
    await expect(page.getByText('verificado nesta sessão')).toBeVisible();
  });

  test('once enrolled, the next sign-in asks only for the code', async ({ page }) => {
    // The previous test enrolled the owner; this one reuses that state, which is why the
    // suite runs serially.
    await signIn(page, USERS.owner.email);
    await expect(page).toHaveURL(/\/login\/2fa$/);
    await expect(page.getByRole('heading', { name: 'Confirme que é você' })).toBeVisible();
  });
});
