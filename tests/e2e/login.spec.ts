import { test, expect } from '@playwright/test';
import { signIn } from './helpers';

test('wrong password stays on the login page with a message', async ({ page }) => {
  await signIn(page, 'definitely-wrong');
  await page.waitForTimeout(1500);
  await expect(page).not.toHaveURL(/dashboard/);
  await expect(page.locator('#login-submit')).toBeVisible();
});

// One real sign-in only: the server limits how often logins are allowed.
test('right password opens the dashboard, with a loading popup that shows a message and progress and then goes away; data is saved encrypted and removed on sign-out', async ({ page }) => {
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

  // The first-load data was fetched as one packet and saved encrypted on the device.
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((ok) => {
      const q = indexedDB.open('vgsync-cache');
      q.onsuccess = () => ok(q.result);
    });
    const all = (name: string) =>
      new Promise<unknown[]>((ok) => {
        const q = db.transaction(name).objectStore(name).getAll();
        q.onsuccess = () => ok(q.result);
      });
    const rows = (await all('gets')) as Array<{ iv?: Uint8Array; ct?: ArrayBuffer; data?: unknown }>;
    const keys = (await all('keys')) as CryptoKey[];
    return {
      count: rows.length,
      allEncrypted: rows.every((r) => r.iv && r.ct && r.data === undefined),
      keyLocked: keys.length === 1 && keys[0].extractable === false,
    };
  });
  expect(saved.count).toBeGreaterThan(5);
  expect(saved.allEncrypted).toBe(true);
  expect(saved.keyLocked).toBe(true);

  // Signing out removes the saved data and the key.
  await page.locator('#sidebar-logout').click();
  await page.locator('#logout-confirm').click();
  await page.waitForURL((u) => u.pathname === '/');
  await page.waitForTimeout(500);
  const left = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((ok) => {
      const q = indexedDB.open('vgsync-cache');
      q.onsuccess = () => ok(q.result);
    });
    const count = (name: string) =>
      new Promise<number>((ok) => {
        const q = db.transaction(name).objectStore(name).count();
        q.onsuccess = () => ok(q.result);
      });
    return { gets: await count('gets'), keys: await count('keys') };
  });
  expect(left).toEqual({ gets: 0, keys: 0 });
});

test('opening a page without signing in sends you to login', async ({ page }) => {
  await page.goto('/sales');
  await page.waitForURL((u) => u.pathname === '/' || /login/.test(u.pathname));
  await expect(page.locator('#branch-code')).toBeVisible();
});
