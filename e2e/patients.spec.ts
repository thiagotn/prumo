import { expect, test } from '@playwright/test';
import { USERS, deletePatientsNamed, signInWithoutTwoFactor } from './fixtures';

test.describe('patients', () => {
  test('reception lists the clinic patients and can filter and search', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/patients');

    await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Renata Yamada' })).toBeVisible();

    // The seeded clinic has patients with a clinical alert; the filter narrows to them.
    await page.getByRole('link', { name: 'Com alerta clínico' }).click();
    await expect(page).toHaveURL(/filter=alert/);
    await expect(page.getByRole('cell', { name: 'Juliana Prado' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Carla Bueno' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Todas' }).click();
    // Wait for the filter to actually clear: the form carries a hidden `filter` field,
    // so typing before the navigation lands would search within the previous filter.
    await expect(page).toHaveURL(/\/patients$/);
    await page.getByLabel('Buscar paciente').fill('Carla');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByRole('cell', { name: 'Carla Bueno' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Renata Yamada' })).toHaveCount(0);
  });

  test('the side panel shows the clinical alert prominently', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/patients');

    await page.getByRole('link', { name: /Juliana Prado/ }).click();

    const panel = page.getByRole('complementary', { name: 'Detalhes da paciente' });
    await expect(panel.getByRole('heading', { name: 'Juliana Prado' })).toBeVisible();
    await expect(panel.getByRole('note')).toContainText('Alergia a lidocaína');
    // Reception sees the short line, and the panel says what it would take to reach the
    // record itself.
    await expect(panel).toContainText('exigem 2FA');
  });

  test('a patient from another clinic never appears', async ({ browser }) => {
    // Vértice is seeded with no patients at all; if the tenant slice leaked, Tati's would
    // show up here.
    const context = await browser.newContext({ baseURL: 'http://vertice.localhost:3100' });
    const page = await context.newPage();

    await page.goto('/login');
    await page.getByLabel('E-mail').fill('recepcao@verticesaude.com.br');
    await page.getByLabel('Senha').fill('prumo1234');
    await page.getByRole('button', { name: 'Entrar' }).click();
    // Wait for the shell before navigating: click() does not await the sign-in, and
    // going straight to /patients would bounce back to the login.
    await expect(page.getByRole('navigation', { name: 'Módulos' })).toBeVisible();
    await page.goto('/patients');

    await expect(page.getByText('Nenhuma paciente cadastrada ainda.')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Renata Yamada' })).toHaveCount(0);

    await context.close();
  });
});

test.describe('registering a patient', () => {
  // Serial: the second test corrects the patient the first one registered.
  test.describe.configure({ mode: 'serial' });

  // Named with the run's timestamp so a leftover from an earlier run can never make this
  // pass or fail by accident. The rows are removed at the end.
  const PREFIX = 'Teste Cadastro';
  const name = `${PREFIX} ${Date.now()}`;

  test.afterAll(async () => {
    await deletePatientsNamed(PREFIX);
  });

  test('reception registers a patient, and the CPF is checked before it is stored', async ({
    page,
  }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/patients');

    await page.getByRole('link', { name: 'Nova paciente' }).click();
    await expect(page).toHaveURL(/\/patients\/new$/);

    await page.getByLabel('Nome completo').fill(name);
    await page.getByLabel('Telefone').fill('11 98765-4321');
    await page.getByLabel('CPF').fill('529.982.247-26');
    await page.getByRole('button', { name: 'Cadastrar paciente' }).click();

    // A wrong check digit is caught before anything is written.
    await expect(page.locator('form').getByRole('alert')).toContainText('CPF inválido');
    await expect(page).toHaveURL(/\/patients\/new$/);

    await page.getByLabel('CPF').fill('');
    await page.getByLabel('Alerta clínico').fill('Alergia a dipirona');
    await page.getByRole('button', { name: 'Cadastrar paciente' }).click();

    // Lands back on the list, with the new patient selected and her alert in the panel.
    await expect(page).toHaveURL(/\/patients\?selected=[0-9a-f-]+&saved=1$/);
    await expect(page.getByRole('status')).toContainText('Cadastro salvo');
    const panel = page.getByRole('complementary', { name: 'Detalhes da paciente' });
    await expect(panel.getByRole('heading', { name })).toBeVisible();
    await expect(panel.getByRole('note')).toContainText('Alergia a dipirona');
    await expect(panel).toContainText('(11) 98765-4321');
  });

  test('the registered patient is found by the search, and can be corrected', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/patients');

    await page.getByLabel('Buscar paciente').fill(name);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.getByRole('link', { name: new RegExp(name) }).click();

    await page.getByRole('link', { name: 'Editar cadastro' }).click();
    await expect(page).toHaveURL(/\/patients\/[0-9a-f-]+\/edit$/);
    await expect(page.getByLabel('Nome completo')).toHaveValue(name);

    await page.getByLabel('Alerta clínico').fill('Uso de anticoagulante');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();

    const panel = page.getByRole('complementary', { name: 'Detalhes da paciente' });
    await expect(panel.getByRole('note')).toContainText('Uso de anticoagulante');
  });

  test('a patient registered in one clinic does not appear in another', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: 'http://vertice.localhost:3100' });
    const page = await context.newPage();

    await page.goto('/login');
    await page.getByLabel('E-mail').fill('recepcao@verticesaude.com.br');
    await page.getByLabel('Senha').fill('prumo1234');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('navigation', { name: 'Módulos' })).toBeVisible();

    await page.goto('/patients');
    await page.getByLabel('Buscar paciente').fill(name);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText('Nenhuma paciente com esses filtros.')).toBeVisible();

    await context.close();
  });
});
