import { expect, test } from '@playwright/test';
import { USERS, deleteAppointmentsNoted, signInWithoutTwoFactor } from './fixtures';

test.describe('schedule', () => {
  test('opens on the day view with the working-hour grid', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/schedule');

    await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible();
    // The grid runs 08h to 18h.
    await expect(page.getByText('8h', { exact: true })).toBeVisible();
    await expect(page.getByText('18h', { exact: true })).toBeVisible();
    // The seeded diary puts a lunch block at midday.
    await expect(page.getByText('Bloqueio').first()).toBeVisible();
  });

  test('switches between day, week and list', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/schedule');

    await page.getByRole('link', { name: 'Semana', exact: true }).click();
    await expect(page).toHaveURL(/view=week/);
    // Monday to Saturday, six columns. Scoped to the grid: the mobile day picker uses
    // the same labels and is display:none here, so an unscoped match finds a hidden one.
    const weekGrid = page.getByTestId('week-grid');
    for (const dayName of ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']) {
      await expect(weekGrid.getByText(dayName, { exact: true })).toBeVisible();
    }

    await page.getByRole('link', { name: 'Lista', exact: true }).click();
    await expect(page).toHaveURL(/view=list/);
    await expect(page.getByRole('columnheader', { name: 'Paciente' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Sala' })).toBeVisible();
  });

  test('navigates days and comes back to today', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/schedule');

    // "Hoje" only appears once you have moved away from today.
    await expect(page.getByRole('link', { name: 'Hoje' })).toHaveCount(0);
    await page.getByRole('link', { name: '→' }).click();
    await expect(page).toHaveURL(/day=\d{4}-\d{2}-\d{2}/);
    await expect(page.getByRole('link', { name: 'Hoje' })).toBeVisible();

    await page.getByRole('link', { name: 'Hoje' }).click();
    await expect(page).toHaveURL(/\/schedule$/);
  });

  test('filters by room', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/schedule?view=list');

    // The seed books into the clinic's own unit, so the other room is genuinely free.
    await expect(page.getByRole('link', { name: 'Coworking Tatuapé' })).toBeVisible();
    await page.getByRole('link', { name: 'Coworking Parque do Carmo' }).click();
    await expect(page).toHaveURL(/room=/);
    await expect(page.getByText('Nenhum atendimento nos próximos 14 dias.')).toBeVisible();

    // And the clinic's own room does have the diary.
    await page.getByRole('link', { name: 'Coworking Tatuapé' }).click();
    await expect(page.getByText('Nenhum atendimento nos próximos 14 dias.')).toHaveCount(0);
  });

  test("another clinic's diary is empty, not borrowed", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: 'http://vertice.localhost:3100' });
    const page = await context.newPage();

    await page.goto('/login');
    await page.getByLabel('E-mail').fill('recepcao@verticesaude.com.br');
    await page.getByLabel('Senha').fill('prumo1234');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('navigation', { name: 'Módulos' })).toBeVisible();

    await page.goto('/schedule?view=list');
    await expect(page.getByText('Nenhum atendimento nos próximos 14 dias.')).toBeVisible();

    await context.close();
  });
});

test.describe('booking an appointment', () => {
  // Serial: the second test books over the slot the first one took.
  test.describe.configure({ mode: 'serial' });

  // The marker goes in the appointment's notes, and the cleanup finds the rows by it.
  const MARKER = `e2e ${Date.now()}`;
  // Far enough ahead that the seeded week never reaches it, and in the room the seed
  // leaves free, so the clash under test is the one this spec creates.
  const DAY = '2027-03-15';
  const ROOM = 'Coworking Parque do Carmo';

  test.afterAll(async () => {
    await deleteAppointmentsNoted(MARKER);
  });

  test('reception books a patient into a free slot', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto(`/schedule?day=${DAY}`);

    await page.getByRole('link', { name: 'Novo agendamento' }).click();
    await expect(page).toHaveURL(/\/schedule\/new/);

    await page.getByLabel('Paciente').selectOption({ label: 'Carla Bueno' });
    await page.getByLabel('Dia').fill(DAY);
    await page.getByLabel('Horário').selectOption('14:00');
    await page.getByLabel('Sala').selectOption({ label: ROOM });
    await page.getByLabel('Situação').selectOption('CONFIRMED');
    await page.getByLabel('Observações').fill(MARKER);
    await page.getByRole('button', { name: 'Agendar' }).click();

    await expect(page).toHaveURL(new RegExp(`/schedule\\?day=${DAY}&saved=1`));
    await expect(page.getByRole('status')).toContainText('Agendamento gravado');
    // And it is in the diary, in the hour it was booked for.
    await expect(page.getByRole('link', { name: /Carla Bueno/ })).toBeVisible();
    await expect(page.getByText('Confirmado')).toBeVisible();
  });

  test('the same room at the same hour is refused, with the clash named', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto(`/schedule/new?day=${DAY}`);

    await page.getByLabel('Paciente').selectOption({ label: 'Renata Yamada' });
    await page.getByLabel('Dia').fill(DAY);
    // Half an hour later: it overlaps the hour already taken, which is exactly the case
    // a per-hour check would miss.
    await page.getByLabel('Horário').selectOption('14:30');
    await page.getByLabel('Sala').selectOption({ label: ROOM });
    await page.getByLabel('Observações').fill(MARKER);
    await page.getByRole('button', { name: 'Agendar' }).click();

    const error = page.locator('form').getByRole('alert');
    await expect(error).toContainText(ROOM);
    await expect(error).toContainText('Carla Bueno');
    await expect(page).toHaveURL(/\/schedule\/new/);
  });

  test('the other room at the same hour is free, and a free slot books it', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto(`/schedule?day=${DAY}`);

    // The empty slots carry the day, the hour and the room filter into the form.
    await page.getByRole('link', { name: 'Livre · agendar' }).first().click();
    await expect(page).toHaveURL(new RegExp(`/schedule/new\\?day=${DAY}&hour=`));

    await page.getByLabel('Paciente').selectOption({ label: 'Renata Yamada' });
    await page.getByLabel('Horário').selectOption('14:00');
    await page.getByLabel('Sala').selectOption({ label: 'Coworking Tatuapé' });
    await page.getByLabel('Observações').fill(MARKER);
    await page.getByRole('button', { name: 'Agendar' }).click();

    await expect(page.getByRole('status')).toContainText('Agendamento gravado');
    await expect(page.getByRole('link', { name: /Renata Yamada/ })).toBeVisible();
  });
});
