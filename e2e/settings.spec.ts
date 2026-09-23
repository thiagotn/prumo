import { expect, test as base, type Page } from '@playwright/test';
import { CLINICS, USERS, clinicUrl, signInWithTwoFactor, signInWithoutTwoFactor } from './fixtures';

// Settings is owner-only and the owner requires a second factor. These tests use the
// Vértice clinic's owner rather than Tati's: enrolling an authenticator is a one-way step
// for an account, and two-factor.spec.ts needs Tati's owner to arrive un-enrolled.
const test = base.extend<{ ownerPage: Page }>({
  ownerPage: async ({ browser }, use) => {
    const context = await browser.newContext({ baseURL: clinicUrl(CLINICS.vertice.host) });
    const page = await context.newPage();
    await signInWithTwoFactor(page, USERS.verticeOwner.email);
    await use(page);
    await context.close();
  },
});

test.describe('settings — access', () => {
  test('reception cannot reach settings at all', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/dashboard\?denied=settings$/);
  });
});

test.describe('settings — pricing parameters', () => {
  test('shows the clinic parameters and the derived overhead', async ({ ownerPage: page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Parâmetros de preço' })).toBeVisible();

    // The real parameters from docs/regras-de-negocio.md.
    await expect(page.getByLabel('Impostos (%)')).toHaveValue('6');
    await expect(page.getByLabel('Maquininha à vista (%)')).toHaveValue('4.5');
    await expect(page.getByLabel('Maquininha parcelado (%)')).toHaveValue('15');
    await expect(page.getByLabel('Margem padrão (%)')).toHaveValue('30');
    await expect(page.getByLabel('Atendimentos por mês')).toHaveValue('40');

    // Fixed costs over expected appointments: 4500 / 40.
    await expect(page.getByText('R$ 112,50').first()).toBeVisible();
  });

  test('the overhead recalculates as the inputs change', async ({ ownerPage: page }) => {
    await page.goto('/settings');
    await page.getByLabel('Atendimentos por mês').fill('50');
    // 4500 / 50 = 90
    await expect(page.getByText('R$ 90,00').first()).toBeVisible();
  });

  test('refuses rates that leave no room for a price', async ({ ownerPage: page }) => {
    await page.goto('/settings');
    await page.getByLabel('Margem padrão (%)').fill('90');
    // 6 + 15 + 90 is over 100%: there is no price that yields that margin.
    await expect(page.getByRole('alert').filter({ hasText: 'abaixo de 100%' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salvar parâmetros' })).toBeDisabled();
  });
});

test.describe('settings — identity', () => {
  test('previews the accent colour and blocks one with too little contrast', async ({
    ownerPage: page,
  }) => {
    await page.goto('/settings');
    const field = page.getByLabel('Cor de acento');

    await field.fill('#b68235');
    await expect(page.getByText(/Contraste 3\.0\d:1/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salvar identidade' })).toBeEnabled();

    // accent-300 from the design system: too pale against the paper.
    await field.fill('#facb8d');
    await expect(page.getByText(/abaixo do mínimo/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salvar identidade' })).toBeDisabled();
  });

  test('shows the permission matrix, which is fixed in the system', async ({ ownerPage: page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'O que cada perfil alcança' })).toBeVisible();
    // Reception reaches no medical record — the row has to say so.
    const row = page.getByRole('row').filter({ hasText: 'Prontuário' });
    await expect(row).toBeVisible();
  });
});
