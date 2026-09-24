import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  CLINICS,
  USERS,
  clinicUrl,
  createAppointmentForTests,
  deleteAppointmentsNoted,
  signIn,
  signInWithoutTwoFactor,
} from './fixtures';

// Mensagens and the patient portal (docs/especificacao.md, screens 9 and 13).

test.describe('mensagens', () => {
  test('lists the six automations, with the preview and the queue', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/messages');

    for (const label of [
      'Lembrete 24h antes',
      'Preparo 48h antes',
      'Pós-procedimento no dia seguinte',
      'Retorno em 14 dias',
      'Política de falta',
      'Aniversário',
    ]) {
      await expect(page.getByRole('heading', { name: label })).toBeVisible();
    }

    // The preview renders the fields rather than showing the braces.
    const preview = page.getByText(/Confirmando seu horário amanhã/).last();
    await expect(preview).toBeVisible();
    await expect(preview).not.toContainText('{{');

    // The seed queues the reminders for the bookings that are still ahead.
    await expect(page.getByRole('complementary', { name: 'Fila e respostas' })).toContainText(
      'Lembrete 24h antes',
    );
  });

  test('says plainly that the channel is not connected', async ({ page }) => {
    // Development and CI have no WhatsApp credentials, and the screen has to say so
    // instead of pretending messages are going out.
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/messages');

    await expect(page.getByText('WhatsApp ainda não conectado')).toBeVisible();
    await expect(page.getByText('nada se perde')).toBeVisible();
  });

  test('editing the wording changes the preview and what is saved', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/messages');

    const marker = `Teste ${Date.now()}`;
    await page.getByLabel('Texto').first().fill(`${marker} — olá, {{paciente}}.`);

    // The preview follows the typing, before anything is saved.
    await expect(page.getByText(`${marker} — olá, Renata.`)).toBeVisible();

    await page.getByRole('button', { name: 'Salvar' }).first().click();
    // By text, not by role: Next's own route announcer is a role="status" too.
    await expect(page.getByText(/Automação salva/).first()).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Texto').first()).toHaveValue(new RegExp(marker));

    // And back to the wording the system ships with, which is also how the clinic undoes
    // an edit it regrets — and what keeps this suite repeatable.
    await page.getByRole('button', { name: 'Restaurar texto padrão' }).first().click();
    await expect(page.getByLabel('Texto').first()).toHaveValue(/Confirmando seu horário amanhã/);
  });

  test('marking a no-show in the diary queues the note about it', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);
    await page.goto('/schedule?view=list');

    // The first booking still open in the next fortnight.
    const row = page
      .getByRole('row')
      .filter({ has: page.getByRole('button', { name: 'Faltou' }) })
      .first();
    const patient = (await row.getByRole('cell').nth(2).innerText()).trim();
    await row.getByRole('button', { name: 'Faltou' }).click();

    await expect(page).toHaveURL(/\/schedule\?view=list/);
    await expect(page.getByRole('row').filter({ hasText: patient }).first()).toContainText('Faltou');

    // And the policy message is in the queue for her.
    await page.goto('/messages');
    const queue = page.getByRole('complementary', { name: 'Fila e respostas' });
    await expect(queue).toContainText('Política de falta');

    // Put the booking back, so the seeded diary survives repeated runs.
    await page.goto('/schedule?view=list');
    await page
      .getByRole('row')
      .filter({ hasText: patient })
      .first()
      .getByRole('button', { name: 'Confirmar' })
      .click();
    await expect(page.getByRole('row').filter({ hasText: patient }).first()).toContainText(
      'Confirmado',
    );
  });
});

test.describe('portal da paciente', () => {
  test('the patient sees her next appointment and confirms it herself', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: clinicUrl(CLINICS.aurora.host) });
    const page = await context.newPage();

    await signIn(page, USERS.patient.email);
    await page.waitForURL(/\/portal$/);

    await expect(page.getByRole('heading', { name: /Olá, Renata/ })).toBeVisible();
    const next = page.getByRole('region', { name: 'Próximo horário' });
    await expect(next).toBeVisible();

    // Either she confirms, or it is already confirmed and only the other button is there.
    const confirm = next.getByRole('button', { name: 'Confirmar presença' });
    if ((await confirm.count()) > 0) {
      await confirm.click();
      await expect(next).toContainText('Confirmado');
    } else {
      await expect(next).toContainText('Confirmado');
    }

    await expect(page.getByRole('region', { name: 'Documentos' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Atendimentos anteriores' })).toBeVisible();
    // The record itself stays with the clinic.
    await expect(page.getByText(/prontuário e as fotos ficam com a clínica/)).toBeVisible();

    await context.close();
  });

  test('the patient reaches nothing but her own portal', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: clinicUrl(CLINICS.aurora.host) });
    const page = await context.newPage();

    await signIn(page, USERS.patient.email);
    await page.waitForURL(/\/portal$/);

    for (const path of ['/patients', '/schedule', '/finance', '/messages', '/consents']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/portal/);
    }

    await context.close();
  });
});

test.describe('webhook de respostas', () => {
  // The secret the dev server runs with (playwright.config.ts).
  const APP_SECRET = 'e2e-app-secret';

  const payload = (from: string, text: string, id: string) =>
    JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '1',
          changes: [{ field: 'messages', value: { messages: [{ from, id, type: 'text', text: { body: text } }] } }],
        },
      ],
    });

  const sign = (body: string) =>
    `sha256=${createHmac('sha256', APP_SECRET).update(body, 'utf8').digest('hex')}`;

  test('refuses a payload that is not signed', async ({ request }) => {
    // Whoever finds this URL could otherwise confirm and cancel appointments.
    const body = payload('5511987650001', '1', `wamid.${Date.now()}`);

    const unsigned = await request.post('/api/whatsapp/webhook', {
      headers: { 'content-type': 'application/json' },
      data: body,
    });
    expect(unsigned.status()).toBe(403);

    const wrong = await request.post('/api/whatsapp/webhook', {
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=deadbeef' },
      data: body,
    });
    expect(wrong.status()).toBe(403);
  });

  test('a signed "1" confirms the patient\'s next appointment', async ({ page, request }) => {
    // A booking of this spec's own, so the assertion does not depend on what the rest of
    // the suite did to the seeded diary.
    const marker = `e2e webhook ${Date.now()}`;
    await createAppointmentForTests({ patientName: 'Renata Yamada', marker });

    try {
      // Renata's number, from the seed.
      const body = payload('5511987650001', '1', `wamid.${Date.now()}`);
      const response = await request.post('/api/whatsapp/webhook', {
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body) },
        data: body,
      });
      expect(response.status()).toBe(200);
      expect(await response.json()).toMatchObject({ received: 1, handled: 1 });

      // And the reply is on the Mensagens screen, with what it did.
      await signInWithoutTwoFactor(page, USERS.reception.email);
      await page.goto('/messages');
      await expect(page.getByRole('complementary', { name: 'Fila e respostas' })).toContainText(
        'Confirmou o horário',
      );
    } finally {
      await deleteAppointmentsNoted(marker);
    }
  });

  test('a message that is not an instruction is recorded and does nothing', async ({ request }) => {
    const body = payload('5511987650001', 'oi, posso levar minha irmã?', `wamid.${Date.now()}`);
    const response = await request.post('/api/whatsapp/webhook', {
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body) },
      data: body,
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ received: 1, handled: 0 });
  });

  test('a retried delivery does not act twice', async ({ request }) => {
    const marker = `e2e retry ${Date.now()}`;
    await createAppointmentForTests({ patientName: 'Renata Yamada', marker });
    const id = `wamid.retry.${Date.now()}`;
    const body = payload('5511987650001', '1', id);
    const headers = { 'content-type': 'application/json', 'x-hub-signature-256': sign(body) };

    const first = await request.post('/api/whatsapp/webhook', { headers, data: body });
    const second = await request.post('/api/whatsapp/webhook', { headers, data: body });

    expect(first.status()).toBe(200);
    expect(await first.json()).toMatchObject({ handled: 1 });
    expect(second.status()).toBe(200);
    // The second time it is a duplicate: recorded already, nothing to do.
    expect(await second.json()).toMatchObject({ handled: 0 });

    await deleteAppointmentsNoted(marker);
  });
});
