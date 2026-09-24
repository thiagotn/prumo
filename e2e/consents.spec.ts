import { expect, test as base, type Page } from '@playwright/test';
import {
  CLINICS,
  USERS,
  clinicUrl,
  createPatientForTests,
  deleteConsentTemplatesNamed,
  deletePatientsNamed,
  signInWithTwoFactor,
  signInWithoutTwoFactor,
} from './fixtures';

// Consent terms (docs/especificacao.md, screen 10): the wording is versioned, the
// signature is collected on screen or by link, and the PDF carries the hash.

const PREFIX = 'Termo Teste';

// The versioning test needs an owner, and enrolling a second factor is a one-way step per
// account: it takes Aurora's, the same one encounter.spec.ts and photos.spec.ts use.
const test = base.extend<{ ownerPage: Page }>({
  ownerPage: async ({ browser }, use) => {
    const context = await browser.newContext({ baseURL: clinicUrl(CLINICS.aurora.host) });
    const page = await context.newPage();
    await signInWithTwoFactor(page, USERS.auroraOwner.email);
    await use(page);
    await context.close();
  },
});

/** The option value behind a term's title, so a spec never depends on the option order. */
async function templateValue(page: Page, title: RegExp | string): Promise<string> {
  const option = page.getByLabel('Termo').locator('option').filter({ hasText: title }).first();
  const value = await option.getAttribute('value');
  if (!value) throw new Error(`No consent template matching ${title}`);
  return value;
}

/** Draws a line on the signature pad, the way a finger would. */
async function sign(page: Page) {
  const pad = page.getByLabel('Assinatura', { exact: false }).first();
  // The app shell scrolls its own content area: without this the pad can sit below the
  // fold, and the mouse would draw on nothing.
  await pad.scrollIntoViewIfNeeded();
  const box = await pad.boundingBox();
  if (!box) throw new Error('signature pad not visible');
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + box.height / 2 - 20, { steps: 8 });
  await page.mouse.move(box.x + 150, box.y + box.height / 2 + 20, { steps: 8 });
  await page.mouse.up();
}

test.describe('consent terms', () => {
  test.describe.configure({ mode: 'serial' });

  const patientName = `${PREFIX} ${Date.now()}`;
  let patientId = '';

  test.beforeAll(async () => {
    patientId = await createPatientForTests(patientName);
  });

  test.afterAll(async () => {
    // Patients first: the consents pointing at the test templates cascade with them.
    await deletePatientsNamed(PREFIX);
    await deleteConsentTemplatesNamed('termo-teste');
  });

  test('the wording is the doctor’s: reception is refused, and told why', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);

    await page.goto('/consents');
    await expect(page.getByRole('heading', { name: 'Aguardando assinatura' })).toBeVisible();
    // The seeded terms are in the panel, and reception sees no way to rewrite them.
    const templates = page.getByRole('complementary', { name: 'Modelos de termo' });
    await expect(templates.getByText('preenchimento labial').first()).toBeVisible();
    await expect(templates.getByText('edição 1').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Novo termo' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Nova edição' })).toHaveCount(0);

    await page.goto('/consents/templates/new');
    await expect(page).toHaveURL(/\/consents\?denied=owner$/);
    await expect(page.getByRole('status')).toContainText('é da doutora');
  });

  test('reception issues a term and collects the signature on screen', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto(`/consents/new?patient=${patientId}`);

    await page.getByLabel('Termo').selectOption(await templateValue(page, 'preenchimento labial'));
    await page.getByLabel('Paciente').selectOption(patientId);
    await page.getByRole('button', { name: 'Emitir termo' }).click();

    await expect(page).toHaveURL(/\/consents\/[0-9a-f-]+\?issued=1$/);
    // The wording arrives with the placeholders already filled in.
    await expect(page.getByText(`Eu, ${patientName}, declaro`)).toBeVisible();

    await page.getByLabel('Quem está assinando').fill(patientName);
    await sign(page);
    await page.getByRole('button', { name: 'Registrar assinatura' }).click();

    await expect(page.getByRole('status')).toContainText('Assinatura registrada');
    await expect(page.getByText('Assinado', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Verificação:')).toBeVisible();
    await expect(page.getByRole('img', { name: `Assinatura de ${patientName}` })).toBeVisible();
  });

  test('the signed term comes out as a PDF', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/consents');

    const row = page.getByRole('row').filter({ hasText: patientName });
    const href = await row.getByRole('link', { name: 'PDF' }).first().getAttribute('href');
    expect(href).toBeTruthy();

    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
    expect(response.headers()['cache-control']).toContain('no-store');
    const body = await response.body();
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('a term can be signed from the link, without a session', async ({ page, browser }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto(`/consents/new?patient=${patientId}`);
    await page.getByLabel('Termo').selectOption(await templateValue(page, 'registro fotográfico'));
    await page.getByLabel('Paciente').selectOption(patientId);
    await page.getByRole('button', { name: 'Emitir termo' }).click();
    await expect(page).toHaveURL(/\/consents\/[0-9a-f-]+\?issued=1$/);

    await page.getByRole('button', { name: 'Gerar link de assinatura' }).click();
    // The <code> block holds the URL alone; the box around it holds explanatory text too.
    const link = (await page.locator('code').filter({ hasText: '/consent/' }).first().innerText()).trim();
    expect(link).toMatch(/^http:\/\/localhost:3100\/consent\/[\w-]+$/);

    // A fresh context: no cookie, no session — the token is the whole authorisation.
    const anonymous = await browser.newContext();
    const patientPage = await anonymous.newPage();
    await patientPage.goto(link);

    await expect(patientPage.getByRole('heading', { name: /registro fotográfico/ })).toBeVisible();
    await patientPage.getByLabel('Quem está assinando').fill(patientName);
    await sign(patientPage);
    await patientPage.getByRole('button', { name: 'Assinar o termo' }).click();

    await expect(patientPage.getByRole('status')).toContainText('Assinatura registrada');
    await expect(patientPage.getByRole('link', { name: /Baixar minha via/ })).toBeVisible();

    // Signing again is refused: the term is no longer pending.
    await patientPage.goto(link);
    await expect(patientPage.getByText('Assinado por')).toBeVisible();

    // And the same token at another clinic's hostname finds nothing.
    const other = await browser.newContext({ baseURL: `http://${CLINICS.vertice.host}` });
    const otherPage = await other.newPage();
    const strayResponse = await otherPage.goto(link.replace(CLINICS.tati.host, CLINICS.vertice.host));
    expect(strayResponse?.status()).toBe(404);

    await anonymous.close();
    await other.close();
  });

  test('a new edition never rewrites what was already signed', async ({ ownerPage }) => {
    const auroraPatient = `${PREFIX} Aurora ${Date.now()}`;
    const auroraPatientId = await createPatientForTests(auroraPatient, CLINICS.aurora.name);
    const termTitle = `Termo Teste edições ${Date.now()}`;
    const firstWording =
      'Primeira edição: eu, {{paciente}}, concordo com o procedimento nos termos descritos aqui.';

    // The doctor writes the term. This is the screen reception was refused.
    await ownerPage.goto('/consents/templates/new');
    await ownerPage.getByLabel('Título do termo').fill(termTitle);
    await ownerPage.getByLabel('Texto').fill(firstWording);
    await ownerPage.getByRole('button', { name: 'Publicar termo' }).click();
    await expect(ownerPage).toHaveURL(/\/consents\?saved=template$/);

    // Issue it and sign it under that wording.
    await ownerPage.goto(`/consents/new?patient=${auroraPatientId}`);
    await ownerPage.getByLabel('Termo').selectOption(await templateValue(ownerPage, termTitle));
    await ownerPage.getByLabel('Paciente').selectOption(auroraPatientId);
    await ownerPage.getByRole('button', { name: 'Emitir termo' }).click();
    await expect(ownerPage).toHaveURL(/\/consents\/[0-9a-f-]+\?issued=1$/);
    const consentUrl = ownerPage.url().replace('?issued=1', '');

    await ownerPage.getByLabel('Quem está assinando').fill(auroraPatient);
    await sign(ownerPage);
    await ownerPage.getByRole('button', { name: 'Registrar assinatura' }).click();
    await expect(ownerPage.getByRole('status')).toContainText('Assinatura registrada');
    await expect(ownerPage.getByText('Primeira edição')).toBeVisible();

    // Now rewrite it. This publishes edition 2 instead of editing edition 1.
    await ownerPage.goto('/consents');
    const templates = ownerPage.getByRole('complementary', { name: 'Modelos de termo' });
    await templates
      .locator('div')
      .filter({ hasText: termTitle })
      .getByRole('link', { name: 'Nova edição' })
      .first()
      .click();
    await expect(ownerPage).toHaveURL(/\/consents\/templates\/[0-9a-f-]+\/edit$/);

    await ownerPage.getByLabel('Texto').fill('Segunda edição, com cláusulas diferentes.');
    await ownerPage.getByRole('button', { name: /Publicar edição 2/ }).click();
    await expect(ownerPage.getByRole('status')).toContainText('O que já estava assinado');
    await expect(templates.filter({ hasText: termTitle })).toContainText('edição 2');

    // And what she signed still says what it said.
    await ownerPage.goto(consentUrl);
    await expect(ownerPage.getByText('Primeira edição')).toBeVisible();
    await expect(ownerPage.getByText('Segunda edição')).toHaveCount(0);
    await expect(ownerPage.getByText('o modelo já está na 2')).toBeVisible();
  });
});
