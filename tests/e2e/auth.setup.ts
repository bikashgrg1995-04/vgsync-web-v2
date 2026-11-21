import { test as setup, expect } from '@playwright/test';
import { signIn } from './helpers';

setup('sign in once and keep the session', async ({ page }) => {
  await signIn(page, undefined, true);
  await page.waitForURL(/\/dashboard/);
  await expect(page.locator('.sidebar-link').first()).toBeVisible();
  await page.context().storageState({ path: 'tests/.auth/user.json' });
});
