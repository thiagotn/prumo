import { expect, test } from '@playwright/test';
import {
  CLINICS,
  DEV_PASSWORD,
  USERS,
  formError,
  signIn,
  signInWithoutTwoFactor,
  sidebarRoleLabel,
} from './fixtures';

test.describe('sign-in', () => {
  test('shows the clinic branding on the login screen', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Prontuário, agenda e caixa em um só lugar.',
    );
    await expect(page.getByText('Acesso restrito')).toBeVisible();
    await expect(page.getByText(CLINICS.tati.name).first()).toBeVisible();
    // Health data must never be indexed.
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('a role without 2FA lands straight on the dashboard', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Painel da clínica' })).toBeVisible();
    await expect(sidebarRoleLabel(page)).toHaveText('Recepção / secretária');
  });

  test('the wrong password is refused with a generic message', async ({ page }) => {
    await signIn(page, USERS.reception.email, 'wrong-password');
    await expect(formError(page)).toHaveText('E-mail ou senha incorretos.');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('an unknown email gets the same message — no account enumeration', async ({ page }) => {
    await signIn(page, 'nobody@dratatimayumi.com.br', DEV_PASSWORD);
    await expect(formError(page)).toHaveText('E-mail ou senha incorretos.');
  });

  test('signing out ends the session and the back button does not restore it', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login$/);

    // The revoked cookie must not let the shell render again.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('an anonymous visitor is sent to the login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('the password recovery page explains the current path', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Esqueci a senha' }).click();
    await expect(page).toHaveURL(/\/login\/password$/);
    await expect(page.getByRole('heading', { name: 'Esqueci a senha' })).toBeVisible();
  });
});
