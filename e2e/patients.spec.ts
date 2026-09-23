import { expect, test } from '@playwright/test';
import { USERS, signInWithoutTwoFactor } from './fixtures';

test.describe('patients', () => {
  test('reception lists the clinic patients and can filter and search', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/patients');

    await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Renata Yamada' })).toBeVisible();

    // The seeded clinic has patients with a clinical alert; the filter narrows to them.
    await page.getByRole('link', { name: 'Com alerta clínico' }).click();
    await expect(page).toHaveURL(/filter=alert/);
    await expect(page.getByRole('cell', { name: 'Juliana Prado' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Carla Bueno' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Todas' }).click();
    // Wait for the filter to actually clear: the form carries a hidden `filter` field,
    // so typing before the navigation lands would search within the previous filter.
    await expect(page).toHaveURL(/\/patients$/);
    await page.getByLabel('Buscar paciente').fill('Carla');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByRole('cell', { name: 'Carla Bueno' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Renata Yamada' })).toHaveCount(0);
  });

  test('the side panel shows the clinical alert prominently', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/patients');

    await page.getByRole('link', { name: /Juliana Prado/ }).click();

    const panel = page.getByRole('complementary', { name: 'Detalhes da paciente' });
    await expect(panel.getByRole('heading', { name: 'Juliana Prado' })).toBeVisible();
    await expect(panel.getByRole('note')).toContainText('Alergia a lidocaína');
    // The medical record itself is not here yet, and the panel says so rather than
    // pretending it is missing.
    await expect(panel).toContainText('etapa 4');
  });

  test('a patient from another clinic never appears', async ({ browser }) => {
    // Vértice is seeded with no patients at all; if the tenant slice leaked, Tati's would
    // show up here.
    const context = await browser.newContext({ baseURL: 'http://vertice.localhost:3100' });
    const page = await context.newPage();

    await page.goto('/login');
    await page.getByLabel('E-mail').fill('recepcao@verticesaude.com.br');
    await page.getByLabel('Senha').fill('prumo1234');
    await page.getByRole('button', { name: 'Entrar' }).click();
    // Wait for the shell before navigating: click() does not await the sign-in, and
    // going straight to /patients would bounce back to the login.
    await expect(page.getByRole('navigation', { name: 'Módulos' })).toBeVisible();
    await page.goto('/patients');

    await expect(page.getByText('Nenhuma paciente cadastrada ainda.')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Renata Yamada' })).toHaveCount(0);

    await context.close();
  });
});
