import { test, expect } from '@playwright/test';
import { PAGES, settled, watchErrors } from './helpers';

for (const path of PAGES) {
  test(`${path} opens without errors`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(path);
    await settled(page);
    expect(await page.title()).not.toBe('');
    const text = await page.locator('main, .app-main, body').first().innerText();
    expect(text).not.toMatch(/\bundefined\b|\bNaN\b|\[object Object\]/);
    expect(errors).toEqual([]);
  });
}

test('old /dashboard/sales address still reaches Sales', async ({ page }) => {
  await page.goto('/dashboard/sales?x=1#returns');
  await page.waitForURL(/\/sales\?x=1#returns/);
});
