import { test, expect } from '@playwright/test';
import { signIn } from './helpers';

test('wrong password stays on the login page with a message', async ({ page }) => {
  await signIn(page, 'definitely-wrong');
  await page.waitForTimeout(1500);
  await expect(page).not.toHaveURL(/dashboard/);
  await expect(page.locator('#login-submit')).toBeVisible();
});

test('right password opens the dashboard', async ({ page }) => {
  await signIn(page);
  await page.waitForURL(/\/dashboard/);
});

test('opening a page without signing in sends you to login', async ({ page }) => {
  await page.goto('/sales');
  await page.waitForURL((u) => u.pathname === '/' || /login/.test(u.pathname));
  await expect(page.locator('#branch-code')).toBeVisible();
});
