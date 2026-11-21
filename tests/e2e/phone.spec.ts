import { test, expect } from '@playwright/test';
import { PAGES, settled } from './helpers';

for (const path of PAGES) {
  test(`${path} fits a phone screen`, async ({ page }) => {
    await page.goto(path);
    await settled(page);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(1);
  });
}
