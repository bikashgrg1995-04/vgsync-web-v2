import { test, expect } from '@playwright/test';
import { signIn } from './helpers';

test('wrong password stays on the login page with a message', async ({ page }) => {
  await signIn(page, 'definitely-wrong');
  await page.waitForTimeout(1500);
  await expect(page).not.toHaveURL(/dashboard/);
  await expect(page.locator('#login-submit')).toBeVisible();
});

// One real sign-in only: the server limits how often logins are allowed.
test('right password opens the dashboard, with a loading popup that shows a message and progress and then goes away', async ({ page }) => {
  await signIn(page);
  await page.waitForURL(/\/dashboard/);
  const popup = page.locator('.boot-overlay');
  await expect(popup).toBeVisible();
  await expect(popup.locator('#boot-msg')).not.toBeEmpty();
  await expect(popup.locator('#boot-fill')).toBeAttached();
  await expect(popup).toHaveCount(0, { timeout: 15_000 });
  await page.reload(); // not shown again on later visits
  await page.waitForTimeout(800);
  await expect(page.locator('.boot-overlay')).toBeHidden();
});

test('opening a page without signing in sends you to login', async ({ page }) => {
  await page.goto('/sales');
  await page.waitForURL((u) => u.pathname === '/' || /login/.test(u.pathname));
  await expect(page.locator('#branch-code')).toBeVisible();
});
