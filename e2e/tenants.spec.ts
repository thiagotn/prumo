import { expect, test } from '@playwright/test';
import { CLINICS, DEV_PASSWORD, USERS, clinicUrl, formError, signInWithoutTwoFactor } from './fixtures';

// Tenant resolution runs off the request Host, so each clinic gets a browser context on
// its REAL hostname (Chromium maps *.localhost to the loopback address). Faking the host
// with x-forwarded-host does not work here: Next validates a Server Action's Origin
// against the Host, and the mismatch makes every form POST fail.

test.describe('tenant resolution by hostname', () => {
  test('each hostname serves its own clinic, with its own accent colour', async ({ browser }) => {
    for (const clinic of Object.values(CLINICS)) {
      const context = await browser.newContext({ baseURL: clinicUrl(clinic.host) });
      const page = await context.newPage();
      await page.goto('/login');

      await expect(page.getByText(clinic.name).first()).toBeVisible();
      // The tenant's colour replaces the design system token at runtime.
      await expect(page.locator('html')).toHaveAttribute(
        'style',
        new RegExp(clinic.accent.replace('#', '')),
      );

      await context.close();
    }
  });

  test('an unknown hostname is a 404, not a generic instance', async ({ browser }) => {
    // An unrouted host reaches the app through the Host header of a loopback name that
    // is not in tenant_domains.
    const context = await browser.newContext({ baseURL: clinicUrl('nowhere.localhost:3100') });
    const page = await context.newPage();
    const response = await page.goto('/login');

    expect(response?.status()).toBe(404);
    await expect(page.getByText('Não há nada neste endereço.')).toBeVisible();

    await context.close();
  });

  test("a user from one clinic cannot sign in at another's hostname", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: clinicUrl(CLINICS.aurora.host) });
    const page = await context.newPage();

    await page.goto('/login');
    await page.getByLabel('E-mail').fill(USERS.reception.email); // a Tati user
    await page.getByLabel('Senha').fill(DEV_PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(formError(page)).toHaveText('E-mail ou senha incorretos.');

    await context.close();
  });

  test("a session cookie from one clinic does not open another", async ({ browser }) => {
    // Sign in at Tati...
    const tatiContext = await browser.newContext({ baseURL: clinicUrl(CLINICS.tati.host) });
    const tatiPage = await tatiContext.newPage();
    await signInWithoutTwoFactor(tatiPage, USERS.reception.email);
    const cookies = await tatiContext.cookies();
    await tatiContext.close();

    // ...then present the very same cookie at Aurora.
    const auroraContext = await browser.newContext({ baseURL: clinicUrl(CLINICS.aurora.host) });
    // Re-point the cookie at the other hostname, which is what a stolen cookie would be.
    await auroraContext.addCookies(
      cookies.map((c) => ({ ...c, domain: 'aurora.localhost', url: undefined })),
    );
    const auroraPage = await auroraContext.newPage();
    await auroraPage.goto('/dashboard');

    await expect(auroraPage).toHaveURL(/\/login$/);

    await auroraContext.close();
  });
});

test.describe('patient portal feature flag', () => {
  test('the patient signs in at Aurora, which has the portal on, and lands there', async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: clinicUrl(CLINICS.aurora.host) });
    const page = await context.newPage();

    await page.goto('/login');
    await page.getByLabel('E-mail').fill(USERS.patient.email);
    await page.getByLabel('Senha').fill(DEV_PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL(/\/portal$/);
    await expect(page.getByRole('heading', { name: 'Minha área' })).toBeVisible();

    // The patient reaches nothing else in the clinic.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/portal\?denied=dashboard$/);

    await context.close();
  });
});
