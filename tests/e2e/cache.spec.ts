import { test, expect } from '@playwright/test';
import { settled } from './helpers';

const apiCalls = (page: import('@playwright/test').Page, bucket: string[]) =>
  page.on('request', (r) => {
    if (r.url().includes(':8000/api') && r.method() === 'GET') bucket.push(new URL(r.url()).pathname);
  });

test('coming back to a list shows saved data without asking the server again', async ({ page }) => {
  await page.goto('/customers');
  await settled(page);
  await page.locator('a.sidebar-link[href="/orders"]').click();
  await settled(page);
  const calls: string[] = [];
  apiCalls(page, calls);
  await page.locator('a.sidebar-link[href="/customers"]').click();
  await expect(page).toHaveURL(/\/customers/);
  await page.waitForTimeout(1500);
  expect(calls.filter((c) => /customers/.test(c))).toEqual([]);
});

test('offline: a page opened before still opens, shows saved data and the offline bar', async ({ page, context }) => {
  await page.goto('/customers');
  await settled(page);
  await page.evaluate(() => navigator.serviceWorker.ready); // service worker is in charge
  await page.reload(); // this load is kept for offline use
  await settled(page);
  const rows = await page.locator('tbody tr').count();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.offline-bar')).toBeVisible();
  await expect(page.locator('.sidebar-link').first()).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(rows);
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator('.offline-bar')).toHaveCount(0);
});
