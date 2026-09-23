// End-to-end tests (CLAUDE.md): the flows a user actually walks — sign-in, 2FA,
// role-filtered navigation, denied access and switching clinic by hostname.
//
// `npm run test:e2e` starts the dev server itself and waits for /healthz. It expects the
// database up and seeded: `npm run db:up && npm run db:migrate && npm run db:seed`.
import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // The suite shares one seeded database, and sign-in throttling counts per email+IP:
  // running files in parallel would trip the throttle and make tests flaky.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 30_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL: BASE_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      // mobile.spec.ts belongs to the mobile project; without this the desktop project
      // would pick it up too and fail on the hidden tab bar.
      testIgnore: /mobile\.spec\.ts$/,
    },
    {
      // The care flow is mobile-first (CLAUDE.md), so the tab bar gets its own project.
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
      testMatch: /mobile\.spec\.ts$/,
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: `${BASE_URL}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // The reseller panel needs a platform host to exist; the e2e suite provides one.
      PLATFORM_HOSTS: 'admin.localhost:3100',
    },
  },
});
