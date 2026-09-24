import { expect, test } from '@playwright/test';
import { USERS, signInWithoutTwoFactor } from './fixtures';

// Financeiro and Relatórios (docs/especificacao.md, screens 6 and 8). The figures come
// from closings the seed created across six months, so the numbers are real arithmetic
// over real rows rather than fixtures typed into the page.

test.describe('financeiro', () => {
  test('shows the month, its ledger and where the profit goes', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.finance.email);
    await page.goto('/finance');

    await expect(page.getByRole('heading', { name: 'Financeiro e caixa' })).toBeVisible();
    const kpis = page.getByRole('region', { name: 'Indicadores do mês' });
    for (const label of ['Faturamento', 'Custos', 'Impostos e taxas', 'Lucro líquido', 'Margem realizada']) {
      await expect(kpis.getByText(label, { exact: true })).toBeVisible();
    }

    // The ledger carries the decomposition, and the side cards explain the numbers.
    await expect(page.getByRole('columnheader', { name: 'Cobrado' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Margem' })).toBeVisible();
    await expect(page.getByText('Recompra de insumos (10%)')).toBeVisible();
    await expect(page.getByText('Rateio por atendimento')).toBeVisible();
    await expect(page.getByText('R$ 112,50')).toBeVisible();
  });

  test('walks back through the months and comes back', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.finance.email);
    await page.goto('/finance');

    await expect(page.getByRole('link', { name: 'Este mês' })).toHaveCount(0);
    await page.getByRole('link', { name: '←' }).click();
    await expect(page).toHaveURL(/month=\d{4}-\d{2}/);
    await expect(page.getByRole('link', { name: 'Este mês' })).toBeVisible();

    // A month with closings has rows; the arithmetic of a past month still adds up.
    await expect(page.getByRole('table')).toBeVisible();

    await page.getByRole('link', { name: 'Este mês' }).click();
    await expect(page).toHaveURL(/\/finance$/);
  });

  test('a margin under 28% is the one the screen points at', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.finance.email);
    await page.goto('/finance');
    // Last month, which the seed always fills — and it discounts one closing a month,
    // which lands below the line. Reached by the arrow rather than by a hardcoded month,
    // so this still passes next year.
    await page.getByRole('link', { name: '←' }).click();

    const lowMargins = page.locator('td[data-low="true"]');
    await expect(lowMargins.first()).toBeVisible();
  });

  test('reception sees what was charged and nothing about cost or margin', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/finance');

    await expect(page.getByText('acesso parcial')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Cobrado' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Margem' })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Custos' })).toHaveCount(0);
    await expect(page.getByText('Recompra de insumos (10%)')).toHaveCount(0);
    // And no export: the ledger with costs in it is not theirs to send anywhere.
    await expect(page.getByRole('link', { name: 'Exportar CSV' })).toHaveCount(0);
  });
});

test.describe('relatórios', () => {
  test('six months of revenue and profit, the mix and the margin guide', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.finance.email);
    await page.goto('/reports');

    await expect(page.getByRole('heading', { name: 'Últimos 6 meses' })).toBeVisible();
    await expect(page.getByText('Faturamento', { exact: true })).toBeVisible();
    await expect(page.getByText('Lucro líquido', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Receita por linha' })).toBeVisible();
    await expect(page.getByText('Faixa-alvo recomendada para injetáveis')).toBeVisible();
    await expect(page.getByText(/No período: R\$/)).toBeVisible();
  });

  test('exports the period as a CSV Excel pt-BR can open', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.finance.email);
    await page.goto('/reports');

    const href = await page.getByRole('link', { name: 'Exportar CSV' }).getAttribute('href');
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/csv');
    expect(response.headers()['content-disposition']).toContain('prumo-');

    const body = await response.text();
    // BOM, semicolons, and no patient name anywhere in it.
    expect(body.charCodeAt(0)).toBe(0xfeff);
    expect(body).toContain('Data;Mês;Procedimento');
    expect(body).toContain('Total;');
    expect(body).not.toContain('Renata Yamada');
  });

  test('exports the same period as a PDF', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.finance.email);
    await page.goto('/reports');

    const href = await page.getByRole('link', { name: 'Exportar PDF' }).getAttribute('href');
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
    expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('reception has no reports at all', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);

    await page.goto('/reports');
    await expect(page).toHaveURL(/\/dashboard\?denied=reports$/);
  });
});

test.describe('painel', () => {
  test('finance sees the money, and no diary', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.finance.email);
    await page.goto('/dashboard');

    await expect(page.getByText('Atendimentos no mês')).toBeVisible();
    await expect(page.getByText('Lucro por hora').first()).toBeVisible();
    // The matrix gives finance no schedule, so the day's list is not on their dashboard.
    await expect(page.getByText('Próximos atendimentos de hoje')).toHaveCount(0);
    await expect(page.getByText('Números, não agenda')).toBeVisible();
  });

  test('reception sees the day, and no profit', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/dashboard');

    await expect(page.getByText('Próximos atendimentos de hoje')).toBeVisible();
    await expect(page.getByText('Faturamento')).toBeVisible();
    await expect(page.getByText('Lucro líquido')).toHaveCount(0);
    await expect(page.getByText('Margem realizada')).toHaveCount(0);
  });
});
