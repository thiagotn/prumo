import { expect, test } from '@playwright/test';
import { USERS, menuLabels, signInWithoutTwoFactor } from './fixtures';

test.describe('role-filtered navigation', () => {
  test('reception sees the schedule but neither reports nor settings', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    const labels = await menuLabels(page);

    expect(labels).toContain('Agenda');
    expect(labels).toContain('Pacientes');
    expect(labels).toContain('Mensagens');
    expect(labels).not.toContain('Relatórios');
    expect(labels).not.toContain('Configurações');
    // The reseller panel belongs to no clinic role.
    expect(labels).not.toContain('Tenants');
  });

  test('finance sees only numbers and supplies', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.finance.email);
    expect(await menuLabels(page)).toEqual(['Painel', 'Financeiro', 'Estoque', 'Relatórios']);
  });
});

test.describe('server-side permission', () => {
  test('typing a forbidden URL redirects and explains — hiding the menu is not the guard', async ({
    page,
  }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);

    await page.goto('/settings');
    await expect(page).toHaveURL(/\/dashboard\?denied=settings$/);
    await expect(page.getByRole('status')).toContainText('não está disponível para o seu perfil');
    await expect(page.getByRole('status')).toContainText('log de auditoria');
  });

  test('reception cannot reach the encounter, which holds health data', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);

    await page.goto('/encounter');
    await expect(page).toHaveURL(/\/dashboard\?denied=encounter$/);
  });

  test('a module with partial access does open, and says so', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);

    await page.goto('/finance');
    await expect(page).toHaveURL(/\/finance$/);
    await expect(page.getByText('acesso parcial')).toBeVisible();
  });

  test('finance cannot reach the schedule', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.finance.email);

    await page.goto('/schedule');
    await expect(page).toHaveURL(/\/dashboard\?denied=schedule$/);
  });
});
