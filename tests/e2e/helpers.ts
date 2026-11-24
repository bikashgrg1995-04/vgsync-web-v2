import { expect, type Page } from '@playwright/test';

export const CREDS = {
  branch: process.env.E2E_BRANCH ?? 'VG-HO',
  user: process.env.E2E_USER ?? 'bikash',
  pass: process.env.E2E_PASS ?? 'Scratch#12345',
};

export async function signIn(page: Page, pass = CREDS.pass, remember = false) {
  await page.goto('/');
  await page.fill('#branch-code', CREDS.branch);
  await page.fill('#username', CREDS.user);
  await page.fill('#password', pass);
  if (remember) await page.locator('#remember-me').check({ force: true });
  await page.click('#login-submit');
}

/** Every page a signed-in owner can open (path only). */
export const PAGES = [
  '/dashboard', '/sales', '/customers', '/purchase', '/suppliers', '/orders', '/inventory',
  '/payments', '/statements', '/reports', '/staff', '/tasks', '/branches',
  '/settings', '/help', '/notifications',
];

/** Collects JS errors and failed API calls while a page is used. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.url().includes(':8000') && r.status() >= 500) errors.push(`${r.status()} ${r.url()}`);
  });
  return errors;
}

/** Wait until the app shell has loaded and the data shimmer is gone. */
export async function settled(page: Page) {
  await expect(page.locator('.sidebar-link').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.sk-bar:visible')).toHaveCount(0, { timeout: 15_000 });
}

/** Click a sidebar link; sub-menu entries are folded until their section is open, so open it first. */
export async function sidebarClick(
  page: import('@playwright/test').Page,
  href: string,
  beforeFinalClick?: () => Promise<void>,
): Promise<void> {
  const link = page.locator(`a.sidebar-link[href="${href}"]`);
  if (!(await link.isVisible())) {
    const parent = await link.evaluate((el) => el.closest('li')?.getAttribute('data-nav-parent') ?? '');
    await page.locator(`a.sidebar-link[data-nav-id="${parent}"]`).click();
    await expect(link).toBeVisible();
  }
  await beforeFinalClick?.();
  await link.click();
}
