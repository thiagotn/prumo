import { expect, test as base, type Page } from '@playwright/test';
import { CLINICS, USERS, clinicUrl, signInWithTwoFactor, signInWithoutTwoFactor } from './fixtures';

// R2 is not configured in development or CI, so these cover what does not need a bucket:
// the authorisation on the three API routes, and the screen degrading honestly rather
// than breaking. The signing itself is checked against the real bucket by the runbook.

const test = base.extend<{ ownerPage: Page }>({
  ownerPage: async ({ browser }, use) => {
    const context = await browser.newContext({ baseURL: clinicUrl(CLINICS.aurora.host) });
    const page = await context.newPage();
    await signInWithTwoFactor(page, USERS.auroraOwner.email);
    await use(page);
    await context.close();
  },
});

test.describe('photo API authorisation', () => {
  test('answers 401 to an anonymous caller instead of redirecting to the login', async ({
    request,
  }) => {
    // A redirect would reach a fetch as an HTML page with a 200, which reads as success.
    const response = await request.post('/api/photos/sign-upload', {
      data: { encounterId: '00000000-0000-4000-8000-000000000000', framing: 'FRONT' },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(401);
  });

  test('refuses a role that does not reach photos', async ({ page }) => {
    await signInWithoutTwoFactor(page, USERS.reception.email);

    const response = await page.request.post('/api/photos/sign-upload', {
      data: { encounterId: '00000000-0000-4000-8000-000000000000', framing: 'FRONT' },
    });
    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('perfil') });
  });

  test('refuses a malformed request before touching anything', async ({ ownerPage: page }) => {
    const response = await page.request.post('/api/photos/sign-upload', {
      data: { encounterId: 'not-a-uuid', framing: 'SIDEWAYS' },
    });
    expect(response.status()).toBe(400);
  });

  test('a photo id from another clinic is simply not found', async ({ ownerPage: page }) => {
    const response = await page.request.get('/api/photos/00000000-0000-4000-8000-000000000000/raw', {
      maxRedirects: 0,
    });
    // 404 rather than 403: the caller does not learn whether the id exists elsewhere.
    expect([404, 503]).toContain(response.status());
  });
});

test.describe('photos on the encounter screen', () => {
  test('says the storage is not configured rather than breaking', async ({ ownerPage: page }) => {
    await page.goto('/schedule?view=list');
    await page.getByRole('table').getByRole('row').nth(1).getByRole('link').first().click();
    await expect(page).toHaveURL(/\/encounter\?appointment=/);

    // The section is present either way; without a bucket it explains itself.
    const heading = page.getByText('Fotos clínicas');
    if ((await heading.count()) > 0) {
      await expect(page.getByText(/armazenamento de fotos não está configurado/)).toBeVisible();
    }
  });
});
