import { expect, test } from '@playwright/test';
import { USERS, signIn } from './fixtures';

// Runs on the "mobile" project (Pixel 5). The care flow is mobile-first (CLAUDE.md).
test.describe('mobile shell', () => {
  test('the tab bar shows the care flow with touch-sized targets', async ({ page }) => {
    await signIn(page, USERS.reception.email);

    const tabBar = page.getByRole('navigation', { name: 'Navegação principal' });
    await expect(tabBar).toBeVisible();

    const tabs = tabBar.getByRole('link');
    const count = await tabs.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(5);

    // CLAUDE.md requires >= 44px touch targets in the care flows.
    for (let i = 0; i < count; i++) {
      const box = await tabs.nth(i).boundingBox();
      expect(box, 'the tab has to be rendered').not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    // Reception has no encounter, so it must not be offered on the phone either.
    await expect(tabBar.getByRole('link', { name: 'Atendimento' })).toHaveCount(0);
  });

  test('the desktop sidebar gives way to the compact header', async ({ page }) => {
    await signIn(page, USERS.reception.email);

    await expect(page.getByRole('navigation', { name: 'Módulos' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Painel da clínica' })).toBeVisible();
  });

  test('the help is reachable from the phone header', async ({ page }) => {
    // The tab bar holds the five destinations of the care flow and there is no sidebar
    // here, so without this link the help would be out of reach on a phone.
    // signIn, not signInWithoutTwoFactor: that helper waits for the sidebar, which is
    // display:none at this width and therefore absent from the accessibility tree.
    await signIn(page, USERS.reception.email);
    await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();

    // By test id: the sidebar's own "Ajuda" is still in the DOM here, just hidden.
    const help = page.getByTestId('mobile-help');
    await expect(help).toBeVisible();
    const box = await help.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await help.click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(page.getByRole('heading', { name: 'Ajuda', level: 1 })).toBeVisible();
  });

  test('the login is usable at phone width', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByLabel('E-mail')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();

    // No horizontal scrolling — the layout has to fit the viewport.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});
