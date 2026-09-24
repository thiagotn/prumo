import { expect, test } from '@playwright/test';
import { CLINICS, USERS, clinicUrl, signIn, signInWithoutTwoFactor } from './fixtures';

// Ajuda: the FAQ the team maintains, served inside the app for whoever runs the clinic.

test.describe('ajuda', () => {
  test('reception reaches it from the menu and reads an answer', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);

    await page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Ajuda' }).click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(page.getByRole('heading', { name: 'Ajuda', level: 1 })).toBeVisible();

    // The sections of the FAQ, and one answer rendered as text rather than as markdown.
    const index = page.getByRole('complementary', { name: 'Assuntos' });
    await expect(index.getByRole('link', { name: 'Agenda' })).toBeVisible();
    await expect(index.getByRole('link', { name: 'Estoque' })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Como marco um horário?' })).toBeVisible();
    await expect(page.getByText('**')).toHaveCount(0);
  });

  test('the search finds an answer by a word inside it', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/help');

    await page.getByLabel('Buscar na ajuda').fill('repor');
    await page.getByRole('button', { name: 'Buscar' }).click();

    await expect(page).toHaveURL(/\/help\?q=repor$/);
    await expect(page.getByRole('heading', { name: /Repor/ }).first()).toBeVisible();
    // Accents and case do not matter.
    await page.getByLabel('Buscar na ajuda').fill('PRONTUARIO');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText(/resposta[s]? para/)).toBeVisible();

    await page.getByLabel('Buscar na ajuda').fill('ressonância magnética');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText('Nenhuma resposta com esse termo.')).toBeVisible();
  });

  test('renders the tables and lists the FAQ uses', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/help?q=alcança');

    // "O que cada perfil vê" carries a table; it must arrive as a table.
    await expect(page.getByRole('table').first()).toBeVisible();
    await expect(page.getByRole('cell', { name: /Recepção/ }).first()).toBeVisible();
  });

  test('the patient portal has no clinic help in it', async ({ browser }) => {
    // The FAQ is written in the language of whoever runs the clinic.
    const context = await browser.newContext({ baseURL: clinicUrl(CLINICS.aurora.host) });
    const page = await context.newPage();

    await signIn(page, USERS.patient.email);
    await page.waitForURL(/\/portal$/);
    await expect(
      page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Ajuda' }),
    ).toHaveCount(0);

    await page.goto('/help');
    await expect(page).toHaveURL(/\/portal/);

    await context.close();
  });
});
