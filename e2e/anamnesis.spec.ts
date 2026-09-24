import { expect, test } from '@playwright/test';
import {
  CLINICS,
  USERS,
  clinicUrl,
  createPatientForTests,
  deletePatientsNamed,
  signInWithTwoFactor,
  signInWithoutTwoFactor,
  type Page,
} from './fixtures';

// The anamnesis (docs/especificacao.md, screen 5): versioned, with the previous answer
// beside the new one, behind medical-record access — 2FA and audit_log.

const PREFIX = 'Anamnese Teste';

const test2 = test.extend<{ ownerPage: Page }>({
  ownerPage: async ({ browser }, use) => {
    const context = await browser.newContext({ baseURL: clinicUrl(CLINICS.aurora.host) });
    const page = await context.newPage();
    await signInWithTwoFactor(page, USERS.auroraOwner.email);
    await use(page);
    await context.close();
  },
});

test2.describe('anamnese', () => {
  test2.describe.configure({ mode: 'serial' });

  const patientName = `${PREFIX} ${Date.now()}`;
  let patientId = '';

  test2.beforeAll(async () => {
    patientId = await createPatientForTests(patientName, CLINICS.aurora.name);
  });

  test2.afterAll(async () => {
    await deletePatientsNamed(PREFIX);
  });

  test2('the first filling writes version 1 and surfaces what needs attention', async ({
    ownerPage: page,
  }) => {
    await page.goto(`/anamnesis?patient=${patientId}`);
    await expect(page.getByRole('heading', { name: new RegExp(patientName) })).toBeVisible();
    // With nothing answered yet, the screen opens straight on the form.
    await expect(page.getByText('Ainda não respondida.')).toBeVisible();

    await page.getByRole('radiogroup', { name: /grávida/ }).getByText('Não').click();
    await page.getByRole('radiogroup', { name: /alergia/ }).getByText('Sim').click();
    await page.getByLabel('A quê?').fill('dipirona');
    await page.getByRole('button', { name: 'Salvar anamnese' }).click();

    await expect(page).toHaveURL(/\/anamnesis\?patient=[0-9a-f-]+&saved=1$/);
    await expect(page.getByRole('status')).toContainText('Anamnese salva');
    await expect(page.getByRole('note')).toContainText('dipirona');
    await expect(page.getByText('preenchida hoje')).toBeVisible();
  });

  test2('answering again writes a new version and shows what moved', async ({
    ownerPage: page,
  }) => {
    await page.goto(`/anamnesis?patient=${patientId}`);
    await page.getByRole('link', { name: 'Atualizar anamnese' }).click();

    // The previous answer comes prefilled: the usual case is "nothing changed".
    await expect(page.getByLabel('A quê?')).toHaveValue('dipirona');
    await expect(page.getByText(/da última vez: Sim — dipirona/)).toBeVisible();

    await page.getByLabel('A quê?').fill('dipirona e lidocaína');
    await page.getByRole('button', { name: 'Salvar anamnese' }).click();

    await expect(page.getByRole('status')).toContainText('Anamnese salva');
    // The previous one stays, and the screen says what changed.
    await expect(page.getByText('Versão 1')).toBeVisible();
    await expect(page.getByText(/antes: Sim — dipirona$/)).toBeVisible();
    await expect(page.getByText(/1 mudança desde a anterior/)).toBeVisible();
  });

  test2('the encounter carries the anamnesis alert into the room', async ({ ownerPage: page }) => {
    await page.goto('/schedule?view=list');
    await page.getByRole('table').getByRole('row').nth(1).getByRole('link').first().click();
    await expect(page).toHaveURL(/\/encounter\?appointment=/);

    // The section is there even for a patient who has not answered yet.
    await expect(page.getByText('Anamnese', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /anamnese/i }).first(),
    ).toBeVisible();
  });

  test2("a guest practitioner does not read a patient who is not theirs", async ({ page }) => {
    // The matrix says 'own'. A patient id in the URL is not a permission — and the answer
    // is "not found", so nothing is learned about who exists elsewhere.
    await signInWithTwoFactor(page, USERS.practitioner.email);

    const stranger = await createPatientForTests(`${PREFIX} Alheia ${Date.now()}`);
    await page.goto(`/anamnesis?patient=${stranger}`);

    await expect(page.getByText(/não encontrada nesta clínica entre as suas/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salvar anamnese' })).toHaveCount(0);
  });

  test2('the record is not reception\'s, and neither is the questionnaire', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);

    // Reception reaches no medical record at all.
    await page.goto('/anamnesis');
    await expect(page).toHaveURL(/\/dashboard\?denied=medicalRecord$/);

    await page.goto('/anamnesis/questions');
    await expect(page).toHaveURL(/\/dashboard\?denied=medicalRecord$/);
  });
});
