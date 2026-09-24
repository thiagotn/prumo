import { expect, test, type Page } from '@playwright/test';
import { USERS, signInWithoutTwoFactor } from './fixtures';
import { prisma, withPlatformScope } from '../src/lib/db';

// Entrada de nota (docs/especificacao.md, screen 7): the invoice arrived and the boxes
// are on the counter.

/** The option value behind a product's brand — selectOption takes no regular expression. */
async function productValue(page: Page, brand: string): Promise<string> {
  const option = page.getByLabel('Produto').locator('option').filter({ hasText: brand }).first();
  const value = await option.getAttribute('value');
  if (!value) throw new Error(`No product option for ${brand}`);
  return value;
}

/** Removes what a run created, so the catalogue does not grow test brands. */
async function removeTestProducts(brandPrefix: string) {
  await withPlatformScope(async (tx) => {
    const products = await tx.product.findMany({
      where: { brand: { startsWith: brandPrefix } },
      select: { id: true },
    });
    const ids = products.map((p) => p.id);
    if (ids.length === 0) return;
    await tx.stockMovement.deleteMany({ where: { lot: { productId: { in: ids } } } });
    await tx.stockLot.deleteMany({ where: { productId: { in: ids } } });
    await tx.product.deleteMany({ where: { id: { in: ids } } });
  });
  await prisma.$disconnect();
}

test.describe('entrada de nota', () => {
  test.describe.configure({ mode: 'serial' });

  const BRAND_PREFIX = 'Teste Estoque';
  const brand = `${BRAND_PREFIX} ${Date.now()}`;
  const lotNumber = `LT-${Date.now()}`;

  test.afterAll(async () => {
    await removeTestProducts(BRAND_PREFIX);
  });

  test('a new brand and its first batch go in together', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.finance.email);
    await page.goto('/inventory');

    await page.getByRole('link', { name: 'Entrada de nota' }).click();
    await expect(page).toHaveURL(/\/inventory\/entry$/);

    await page.getByLabel('Produto').selectOption('new');
    await page.getByLabel('Marca').fill(brand);
    await page.getByLabel('Procedimento').selectOption({ label: 'Toxina botulínica (full face)' });
    await page.getByLabel('Unidade de compra').fill('Frasco 50U');
    await page.getByLabel('Custo de compra (R$)').fill('540,00');
    await page.getByLabel('Rendimento').fill('1');

    await page.getByLabel('Número do lote').fill(lotNumber);
    await page.getByLabel('Validade').fill('2027-12-31');
    await page.getByLabel('Quantidade recebida').fill('2');
    await page.getByLabel('Nota fiscal (opcional)').fill('NF-TESTE');
    await page.getByRole('button', { name: 'Lançar entrada' }).click();

    await expect(page).toHaveURL(/\/inventory\?saved=/);
    await expect(page.getByRole('status')).toContainText('Entrada lançada');

    // And it is in the table, with the quantity, the batch and the cost per appointment.
    const row = page.getByRole('row').filter({ hasText: brand });
    await expect(row).toContainText('Frasco 50U');
    await expect(row).toContainText(lotNumber);
    await expect(row).toContainText('R$ 540,00');
  });

  test('the same batch number is refused for the same product', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.finance.email);
    await page.goto('/inventory/entry');

    await page.getByLabel('Produto').selectOption(await productValue(page, brand));
    await page.getByLabel('Número do lote').fill(lotNumber);
    await page.getByLabel('Quantidade recebida').fill('1');
    await page.getByRole('button', { name: 'Lançar entrada' }).click();

    await expect(page.locator('form').getByRole('alert')).toContainText('Já existe um lote');
    // And what was typed is still on the screen.
    await expect(page.getByLabel('Número do lote')).toHaveValue(lotNumber);
  });

  test('a batch without a cost takes the price of the product', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.finance.email);
    await page.goto('/inventory/entry');

    await page.getByLabel('Produto').selectOption(await productValue(page, brand));
    await page.getByLabel('Número do lote').fill(`${lotNumber}-B`);
    await page.getByLabel('Quantidade recebida').fill('3');
    await page.getByRole('button', { name: 'Lançar entrada' }).click();

    await expect(page).toHaveURL(/\/inventory\?saved=/);
    // Five units now: two from the first batch and three from this one.
    await expect(page.getByRole('row').filter({ hasText: brand })).toContainText('5');
  });

  test('reception opens the stock but does not price it', async ({ page }) => {
    // Reception has `partial` on Estoque precisely because cost is not theirs to see.
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/inventory');
    await expect(page.getByRole('link', { name: 'Entrada de nota' })).toHaveCount(0);

    await page.goto('/inventory/entry');
    await expect(page).toHaveURL(/\/inventory\?denied=write$/);
    await expect(page.getByRole('status')).toContainText('da doutora ou do financeiro');
  });
});
