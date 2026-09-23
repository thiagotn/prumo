import { expect, test as base, type Page } from '@playwright/test';
import { CLINICS, USERS, clinicUrl, formError, signInWithTwoFactor } from './fixtures';

// Closing an encounter is the one flow that touches money and stock at the same time, so
// these tests follow it end to end.
//
// They use the Aurora clinic's owner: enrolling a second factor is a one-way step for an
// account, and two-factor.spec.ts needs Tati's owner to arrive un-enrolled.
/** Opens the first appointment in the list view, scoped to the table. */
async function openFirstAppointment(page: Page) {
  const row = page.getByRole('table').getByRole('row').nth(1);
  await row.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/encounter\?appointment=/);
}

const test = base.extend<{ ownerPage: Page }>({
  ownerPage: async ({ browser }, use) => {
    const context = await browser.newContext({ baseURL: clinicUrl(CLINICS.aurora.host) });
    const page = await context.newPage();
    await signInWithTwoFactor(page, USERS.auroraOwner.email);
    await use(page);
    await context.close();
  },
});

test.describe('encounter', () => {
  test('reception cannot open a record at all', async ({ page }) => {
    const { signInWithoutTwoFactor } = await import('./fixtures');
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/encounter');
    await expect(page).toHaveURL(/\/dashboard\?denied=encounter$/);
  });

  test('shows the cost breakdown and the suggested prices', async ({ ownerPage: page }) => {
    await page.goto('/schedule?view=list');

    // Open the first patient in the diary. Scoped to the table: an unscoped link match
    // finds the hidden "skip to content" link first.
    await openFirstAppointment(page);

    const panel = page.getByRole('complementary', { name: 'Custos e preço sugerido' });
    await expect(panel.getByText('Material')).toBeVisible();
    await expect(panel.getByText('Rateio fixo')).toBeVisible();
    // The overhead is the clinic's: 4500 / 40.
    await expect(panel.getByText('R$ 112,50')).toBeVisible();
    await expect(panel.getByText('Preço sugerido à vista')).toBeVisible();
  });

  test('refuses to close below cost until it is confirmed', async ({ ownerPage: page }) => {
    await page.goto('/schedule?view=list');
    await openFirstAppointment(page);

    await page.getByLabel('Valor cobrado (R$)').fill('1');
    await page.getByRole('button', { name: 'Fechar atendimento' }).click();

    await expect(formError(page)).toContainText('abaixo do custo total');
    // And it offers the explicit confirmation rather than just refusing.
    await expect(page.getByText('Confirmo o fechamento abaixo do custo')).toBeVisible();
  });

  test('closing records the payment, deducts the lot and marks the appointment', async ({
    ownerPage: page,
  }) => {
    // Pick an appointment that is still waiting, so the close is meaningful.
    await page.goto('/schedule?view=list');
    const row = page.getByRole('table').getByRole('row').filter({ hasText: 'Aguardando' }).first();
    await row.getByRole('link').first().click();
    await expect(page).toHaveURL(/\/encounter\?appointment=/);

    // The form pre-fills with the suggested price, which is what the clinic would charge.
    const charged = page.getByLabel('Valor cobrado (R$)');
    const suggested = await charged.inputValue();
    expect(Number(suggested)).toBeGreaterThan(0);

    await page.getByLabel('Forma de pagamento').selectOption('PIX');
    await page.getByRole('button', { name: 'Fechar atendimento' }).click();

    // A successful close re-renders the page into its closed state: the form is gone, and
    // the record shows what was charged and which lot went into the patient.
    await expect(page.getByText(/Fechado em/)).toBeVisible();
    await expect(page.getByText(/Lote usado:/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fechar atendimento' })).toHaveCount(0);

    // The figures are stored, not recomputed, so they survive a reload unchanged.
    await page.reload();
    await expect(page.getByText(/Fechado em/)).toBeVisible();
    await expect(page.getByText('Lucro líquido')).toBeVisible();
    await expect(page.getByText('Margem realizada')).toBeVisible();

    // Pix pays no card fee, so the realised margin beats the configured 30%.
    const marginText = await page
      .getByRole('definition')
      .filter({ hasText: '%' })
      .first()
      .innerText();
    expect(Number(marginText.replace('%', '').replace(',', '.'))).toBeGreaterThan(30);
  });

  test('the closed appointment now reads as attended in the diary', async ({ ownerPage: page }) => {
    await page.goto('/schedule?view=list');
    // The previous test closed one; there is at least one attended row.
    await expect(page.getByText('Atendido').first()).toBeVisible();
  });
});
