import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests. They need the Django backend running (default
 * http://localhost:8000) with demo data, and sign in with the account given by
 * E2E_BRANCH / E2E_USER / E2E_PASS. Use a scratch database, never real data:
 * some tests create nothing, but pages do read whatever is there.
 * See tests/README.md.
 */
const PORT = Number(process.env.E2E_PORT ?? 4400);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  globalSetup: './tests/global-setup.ts',
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 }, storageState: 'tests/.auth/user.json' },
      dependencies: ['setup'],
      testMatch: /(smoke|navigation|cache)\.spec\.ts/,
    },
    {
      name: 'phone',
      use: { ...devices['Pixel 7'], storageState: 'tests/.auth/user.json' },
      dependencies: ['setup'],
      testMatch: /phone\.spec\.ts/,
    },
    { name: 'login', use: { ...devices['Desktop Chrome'] }, testMatch: /login\.spec\.ts/ },
  ],
});
