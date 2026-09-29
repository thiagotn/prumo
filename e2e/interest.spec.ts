import { expect, test } from '@playwright/test';
import { withPlatformScope } from '../src/lib/db';
import { CLINICS, DEV_PASSWORD, USERS, clinicUrl, signInWithTwoFactor } from './fixtures';

// The public "tenho interesse" form and its inbox.
//
// The form answers on the product's contact address: a reserved label under a domain of
// ours, which the wildcard that serves every clinic already covers. In the suite that is
// contato.localhost:3100, derived from PLATFORM_HOSTS exactly as contato.prumo.in is
// derived from admin.prumo.in in production.
const SITE = 'contato.localhost:3100';
const PLATFORM = 'admin.localhost:3100';
const MARK = 'Interesse Teste';

/** The form refuses anything sent in under three seconds. */
const TYPING = 3_200;

async function leadsNamed(prefix: string) {
  return withPlatformScope((tx) =>
    tx.interestLead.findMany({
      where: { name: { startsWith: prefix } },
      select: { name: true, email: true, message: true, host: true, ip: true },
    }),
  );
}

test.afterAll(async () => {
  await withPlatformScope((tx) =>
    tx.interestLead.deleteMany({ where: { name: { startsWith: MARK } } }),
  );
});

test.describe('the public interest form', () => {
  test('the contact address serves the page, and a clinic hostname never does', async ({
    browser,
  }) => {
    const site = await browser.newContext({ baseURL: clinicUrl(SITE) });
    const sitePage = await site.newPage();
    await sitePage.goto('/');
    await expect(sitePage.getByRole('heading', { name: /Prontuário, agenda e caixa/ })).toBeVisible();
    await expect(sitePage.getByRole('heading', { name: 'Tenho interesse' })).toBeVisible();
    await site.close();

    // The clinic's own address belongs to the clinic: the product does not talk over it.
    const clinic = await browser.newContext({ baseURL: clinicUrl(CLINICS.tati.host) });
    const clinicPage = await clinic.newPage();
    await clinicPage.goto('/');
    await expect(clinicPage).toHaveURL(/\/login$/);
    await expect(clinicPage.getByRole('heading', { name: 'Tenho interesse' })).toHaveCount(0);
    await clinic.close();
  });

  test('a filled form is recorded and reaches the platform inbox', async ({ browser }) => {
    const name = `${MARK} ${Date.now()}`;
    const context = await browser.newContext({ baseURL: clinicUrl(SITE) });
    const page = await context.newPage();

    await page.goto('/');
    await page.getByLabel('Seu nome').fill(name);
    await page.getByLabel('E-mail').fill('helena@clinicanova.com.br');
    await page.getByLabel('Telefone ou WhatsApp').fill('(11) 98888-7777');
    await page.getByLabel('Clínica').fill('Clínica Nova');
    await page.getByLabel('O que você precisa').fill('Somos duas injetoras.\n\nQuero ver o estoque.');
    await page.waitForTimeout(TYPING);
    await page.getByRole('button', { name: 'Quero saber mais' }).click();

    await expect(page.getByText('Obrigado pelo interesse.')).toBeVisible();
    await context.close();

    const stored = await leadsNamed(name);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.email).toBe('helena@clinicanova.com.br');
    // The paragraphs the person wrote survive; the hostname it came in on is recorded.
    expect(stored[0]!.message).toContain('Quero ver o estoque.');
    expect(stored[0]!.host).toBe(SITE);

    // And the platform sees it.
    const panel = await browser.newContext({ baseURL: clinicUrl(PLATFORM) });
    const panelPage = await panel.newPage();
    await signInWithTwoFactor(panelPage, 'suporte@atelie.app');
    await panelPage
      .getByRole('navigation', { name: 'Módulos' })
      .getByRole('link', { name: 'Interessados' })
      .click();
    await expect(panelPage).toHaveURL(/\/leads$/);

    const card = panelPage.locator('article').filter({ hasText: name });
    await expect(card.getByText('helena@clinicanova.com.br')).toBeVisible();
    await expect(card.getByText('Clínica Nova')).toBeVisible();

    // Marking it answered moves it out of the default filter, which is the point of the
    // filter — so the outcome is what to assert, not the confirmation that goes with the
    // card.
    await card.getByLabel('Situação').selectOption('CONTACTED');
    await card.getByLabel('Nota interna').fill('respondido por e-mail');
    await card.getByRole('button', { name: 'Salvar' }).click();

    await expect(panelPage.getByRole('link', { name: 'Respondidos (1)' })).toBeVisible();
    await expect(panelPage.locator('article').filter({ hasText: name })).toHaveCount(0);

    await panelPage.goto('/leads?filtro=respondidos');
    const answered = panelPage.locator('article').filter({ hasText: name });
    await expect(answered).toBeVisible();
    // It says who took care of it, which is what the CHECK on the table is there for.
    await expect(answered.getByText(/Suporte/)).toBeVisible();
    await panel.close();
  });

  test('the honeypot is thanked and not recorded', async ({ browser }) => {
    const name = `${MARK} Isca ${Date.now()}`;
    const context = await browser.newContext({ baseURL: clinicUrl(SITE) });
    const page = await context.newPage();

    await page.goto('/');
    await page.getByLabel('Seu nome').fill(name);
    await page.getByLabel('E-mail').fill('robo@exemplo.com');
    // A person never meets this field; a robot reading the HTML fills it.
    await page.locator('#website').fill('https://compre-aqui.example');
    await page.waitForTimeout(TYPING);
    await page.getByRole('button', { name: 'Quero saber mais' }).click();

    // Told it failed, a robot tries another way. It gets the same thank-you as anyone.
    await expect(page.getByText('Obrigado pelo interesse.')).toBeVisible();
    await context.close();

    expect(await leadsNamed(name)).toEqual([]);
  });

  test('a form whose timestamp was rewritten is thanked and not recorded', async ({ browser }) => {
    const name = `${MARK} Forjado ${Date.now()}`;
    const context = await browser.newContext({ baseURL: clinicUrl(SITE) });
    const page = await context.newPage();

    await page.goto('/');
    await page.getByLabel('Seu nome').fill(name);
    await page.getByLabel('E-mail').fill('pressa@exemplo.com');
    // Pretending the form was handed out long enough ago. The signature does not follow.
    await page
      .locator('input[name="issuedAt"]')
      .evaluate((el, value) => ((el as HTMLInputElement).value = value), String(Date.now() - 10_000));
    await page.getByRole('button', { name: 'Quero saber mais' }).click();

    await expect(page.getByText('Obrigado pelo interesse.')).toBeVisible();
    await context.close();

    expect(await leadsNamed(name)).toEqual([]);
  });

  test('a clinic user never reaches the inbox', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: clinicUrl(CLINICS.tati.host) });
    const page = await context.newPage();

    await page.goto('/login');
    await page.getByLabel('E-mail').fill(USERS.reception.email);
    await page.getByLabel('Senha').fill(DEV_PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await expect(
      page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Interessados' }),
    ).toHaveCount(0);

    await page.goto('/leads');
    await expect(page).toHaveURL(/\/dashboard\?denied=leads$/);

    await context.close();
  });
});
