import { expect, test } from '@playwright/test';
import { CLINICS, DEV_PASSWORD, USERS, clinicUrl, signInWithTwoFactor } from './fixtures';

// O painel da revenda (docs/especificacao.md, tela 12) e o "entrar como".
// The reseller panel lives on the platform host, which the suite provides through
// PLATFORM_HOSTS (see playwright.config.ts).

const PLATFORM = 'admin.localhost:3100';

test.describe('reseller panel', () => {
  test('the platform host shows the clinics, the money and the use', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: clinicUrl(PLATFORM) });
    const page = await context.newPage();

    await signInWithTwoFactor(page, 'suporte@atelie.app');
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Tenants' }).click();
    await expect(page).toHaveURL(/\/tenants$/);

    const kpis = page.getByRole('region', { name: 'Indicadores da plataforma' });
    for (const label of ['Clínicas ativas', 'MRR', 'Atendimentos no mês', 'Churn do mês']) {
      await expect(kpis.getByText(label, { exact: true })).toBeVisible();
    }

    // The three seeded clinics are there, with their plan and billing.
    for (const clinic of [CLINICS.tati.name, CLINICS.aurora.name, CLINICS.vertice.name]) {
      await expect(page.getByRole('cell', { name: new RegExp(clinic) }).first()).toBeVisible();
    }

    await context.close();
  });

  test('a clinic user never reaches the platform panel', async ({ page }) => {
    // Reception of a clinic, on the clinic's own host.
    const { signInWithoutTwoFactor } = await import('./fixtures');
    await signInWithoutTwoFactor(page, USERS.reception.email);

    await page.goto('/tenants');
    await expect(page).toHaveURL(/\/dashboard\?denied=tenants$/);
  });

  test('the platform host refuses a clinic login', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: clinicUrl(PLATFORM) });
    const page = await context.newPage();

    await page.goto('/login');
    await page.getByLabel('E-mail').fill(USERS.reception.email);
    await page.getByLabel('Senha').fill(DEV_PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.locator('form').getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await context.close();
  });

  test('"entrar como" opens the clinic with the banner up and the record masked', async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: clinicUrl(PLATFORM) });
    const page = await context.newPage();

    await signInWithTwoFactor(page, 'suporte@atelie.app');
    await page.goto('/tenants');

    const row = page.getByRole('row').filter({ hasText: CLINICS.tati.name });
    await row.getByRole('button', { name: 'Entrar como' }).click();

    // It lands on the clinic's own hostname, already inside.
    await page.waitForURL((url) => url.host === CLINICS.tati.host && url.pathname === '/dashboard');
    await expect(page.getByText('Sessão assumida pela plataforma.')).toBeVisible();
    await expect(page.getByText(/mascarados/)).toBeVisible();

    // And the medical record really is masked, not merely announced. The URL has to be
    // absolute: this context's baseURL is the platform, and the session lives on the clinic.
    await page.goto(`${clinicUrl(CLINICS.tati.host)}/schedule?view=list`);
    await page.getByRole('table').getByRole('row').nth(1).getByRole('link').first().click();
    await expect(page).toHaveURL(/\/encounter\?appointment=/);
    await expect(page.getByText('•••••••').first()).toBeVisible();

    await context.close();
  });

  test('the ticket is single use and dies with the minute', async ({ browser, request }) => {
    const context = await browser.newContext({ baseURL: clinicUrl(PLATFORM) });
    const page = await context.newPage();

    await signInWithTwoFactor(page, 'suporte@atelie.app');
    await page.goto('/tenants');

    // The ticket only exists in the redirect; catch it as the browser goes through.
    // By request and not by navigation: the server redirects again before the document
    // lands, so /enter/<ticket> never becomes a frame URL.
    const seen: string[] = [];
    page.on('request', (request) => {
      if (request.isNavigationRequest()) seen.push(request.url());
    });

    await page
      .getByRole('row')
      .filter({ hasText: CLINICS.aurora.name })
      .getByRole('button', { name: 'Entrar como' })
      .click();
    await page.waitForURL((url) => url.host === CLINICS.aurora.host && url.pathname === '/dashboard');

    const spent = seen.find((url) => url.includes('/enter/'));
    expect(spent, 'the handoff URL has to appear in the navigation').toBeTruthy();

    // Replaying the same URL must not open a second session.
    const replay = await request.get(spent!);
    expect(replay.status()).toBe(200);
    expect(await replay.text()).toContain('já foi usado');

    // A ticket that never existed is refused with the same face.
    const unknown = await request.get(`${clinicUrl(CLINICS.aurora.host)}/enter/nao-existe-este-bilhete`);
    expect(unknown.status()).toBe(200);
    expect(await unknown.text()).toContain('Não deu para entrar');

    await context.close();
  });
});
