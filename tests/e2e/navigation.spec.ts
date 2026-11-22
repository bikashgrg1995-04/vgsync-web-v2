import { test, expect } from '@playwright/test';
import { settled, watchErrors } from './helpers';

// Regression: Purchase Return / Returns / Follow-ups used to open the wrong page.
const LINKS: Array<{ href: string; path: string; hash: string }> = [
  { href: '/sales#returns', path: '/sales', hash: '#returns' },
  { href: '/sales#followups', path: '/sales', hash: '#followups' },
  { href: '/purchase#returns', path: '/purchase', hash: '#returns' },
  { href: '/staff#positions', path: '/staff', hash: '#positions' },
  { href: '/staff#team', path: '/staff', hash: '#team' },
  { href: '/customers', path: '/customers', hash: '' },
  { href: '/orders', path: '/orders', hash: '' },
  { href: '/payments', path: '/payments', hash: '' },
];

test('sidebar links land on the right page and section', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/dashboard');
  await settled(page);
  for (const l of LINKS) {
    await page.locator(`a.sidebar-link[href="${l.href}"]`).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(l.path);
    await expect.poll(() => new URL(page.url()).hash).toBe(l.hash);
    // the matching link, and only that one, is marked current
    await expect(page.locator(`a.sidebar-link[href="${l.href}"]`)).toHaveClass(/is-active/);
    await expect(page.locator('a.sidebar-link.is-active')).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test('Purchase Return shows the purchase page, Sales Return shows the sales page', async ({ page }) => {
  await page.goto('/dashboard');
  await settled(page);
  await page.locator('a.sidebar-link[href="/purchase#returns"]').click();
  await expect(page).toHaveURL(/\/purchase#returns/);
  const purchaseTitle = await page.title();
  await page.locator('a.sidebar-link[href="/sales#returns"]').click();
  await expect(page).toHaveURL(/\/sales#returns/);
  expect(await page.title()).not.toBe(purchaseTitle);
});

test('back and forward buttons follow the pages', async ({ page }) => {
  await page.goto('/dashboard');
  await settled(page);
  await page.locator('a.sidebar-link[href="/customers"]').click();
  await expect(page).toHaveURL(/\/customers/);
  await page.locator('a.sidebar-link[href="/orders"]').click();
  await expect(page).toHaveURL(/\/orders/);
  await page.goBack();
  await expect(page).toHaveURL(/\/customers/);
  await page.goForward();
  await expect(page).toHaveURL(/\/orders/);
});

test('Sales Return sits under Sales and Purchase Return under Purchase in the sidebar', async ({ page }) => {
  await page.goto('/dashboard');
  await settled(page);
  const order = await page.locator('a.sidebar-link').evaluateAll((els) => els.map((e) => e.getAttribute('data-nav-id')));
  expect(order.indexOf('returns')).toBe(order.indexOf('sales') + 1);
  expect(order.indexOf('purchase-returns')).toBe(order.indexOf('purchase') + 1);
  await expect(page.locator('a[data-nav-id="returns"]')).toHaveText(/Sales Return/);
  await expect(page.locator('li.sidebar-sub')).toHaveCount(2);
});

test('Follow-ups and Sales Return open at once from Customers, not after the Sales data loads', async ({ page }) => {
  await page.goto('/customers');
  await settled(page);
  await page.route('**:8000/**', async (r) => {
    await new Promise((s) => setTimeout(s, 1500)); // slow server
    await r.continue();
  });
  for (const [href, title] of [['/sales#followups', 'Follow-ups'], ['/sales#returns', 'Sales Returns']] as const) {
    await page.locator(`a.sidebar-link[href="${href}"]`).click();
    // well before the 1.5 s answers arrive, the right list must already be showing
    await expect(page.locator('.header-title')).toHaveText(title, { timeout: 1000 });
    await page.locator('a.sidebar-link[href="/customers"]').click();
    await expect(page).toHaveURL(/\/customers/);
  }
});

test('no flash of the wrong view while opening Follow-ups, Sales Return or Purchase Return', async ({ page }) => {
  await page.goto('/customers');
  await settled(page);
  await page.route('**:8000/**', async (r) => {
    await new Promise((s) => setTimeout(s, 400));
    await r.continue();
  });
  for (const href of ['/sales#followups', '/sales#returns', '/purchase#returns']) {
    await page.evaluate(() => {
      const w = window as unknown as { __bad: string[]; __stop: boolean };
      w.__bad = [];
      w.__stop = false;
      const tick = () => {
        const box = document.querySelector('.app-content-inner');
        const shown = document.querySelector('[data-panel].is-active')?.getAttribute('data-panel');
        const hidden = box?.classList.contains('is-setting-up');
        if (location.hash && shown && shown !== location.hash.slice(1) && !hidden) w.__bad.push(`${shown} shown for ${location.hash}`);
        if (!w.__stop) requestAnimationFrame(tick);
      };
      tick();
    });
    await page.locator(`a.sidebar-link[href="${href}"]`).click();
    await page.waitForTimeout(1500);
    const bad = await page.evaluate(() => {
      const w = window as unknown as { __bad: string[]; __stop: boolean };
      w.__stop = true;
      return w.__bad;
    });
    expect(bad).toEqual([]);
    await page.locator('a.sidebar-link[href="/customers"]').click();
    await expect(page).toHaveURL(/\/customers/);
  }
});
