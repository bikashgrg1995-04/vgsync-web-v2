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
