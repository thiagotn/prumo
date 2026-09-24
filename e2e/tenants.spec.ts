import { expect, test } from '@playwright/test';
import {
  CLINICS,
  DEV_PASSWORD,
  USERS,
  clinicUrl,
  createPatientForTests,
  deletePatientsNamed,
  formError,
  signInWithoutTwoFactor,
} from './fixtures';

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

test.describe('a clinic on more than one address', () => {
  // A clinic is reachable both under the product's domain (<clinic>.prumo.in) and under
  // its own (app.<clinic>.com.br). In the seed the same shape exists locally: Tati
  // answers on localhost:3100 and on tati.localhost:3100.
  const OTHER_DOOR = 'tati.localhost:3100';
  const PREFIX = 'Endereco Teste';

  test.afterAll(async () => {
    await deletePatientsNamed(PREFIX);
  });

  test('both hostnames open the same clinic, with the same data', async ({ browser }) => {
    const name = `${PREFIX} ${Date.now()}`;
    await createPatientForTests(name);

    for (const host of [CLINICS.tati.host, OTHER_DOOR]) {
      const context = await browser.newContext({ baseURL: clinicUrl(host) });
      const page = await context.newPage();
      await signInWithoutTwoFactor(page, USERS.reception.email);

      await page.goto('/patients');
      await page.getByRole('searchbox').fill(PREFIX);
      await expect(page.getByText(name).first()).toBeVisible();

      await context.close();
    }
  });

  test('a link for a patient comes out on the clinic address, whichever door issued it', async ({
    browser,
  }) => {
    // The reception was working on the other hostname; the patient still gets the
    // address the clinic calls its own.
    const context = await browser.newContext({ baseURL: clinicUrl(OTHER_DOOR) });
    const page = await context.newPage();
    const patientId = await createPatientForTests(`${PREFIX} Link ${Date.now()}`);

    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto(`/consents/new?patient=${patientId}`);
    const option = page.getByLabel('Termo').locator('option').nth(1);
    await page.getByLabel('Termo').selectOption((await option.getAttribute('value'))!);
    await page.getByLabel('Paciente').selectOption(patientId);
    await page.getByRole('button', { name: 'Emitir termo' }).click();
    await expect(page).toHaveURL(/\/consents\/[0-9a-f-]+\?issued=1$/);

    await page.getByRole('button', { name: 'Gerar link de assinatura' }).click();
    const link = (await page.locator('code').filter({ hasText: '/consent/' }).first().innerText()).trim();
    expect(link).toMatch(new RegExp(`^http://${CLINICS.tati.host}/consent/[\\w-]+$`));

    await context.close();
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
