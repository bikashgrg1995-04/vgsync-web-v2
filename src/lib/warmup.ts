/**
 * Fills the saved copy in the background after sign-in, so the first visit to
 * each page is already instant. One request at a time, only while the browser
 * is idle, only for what this person is allowed to open, and only once in a
 * while per tab. Any failure is ignored.
 */

import { api } from './api';
import { getSession } from './auth';

interface Warm {
  path: string;
  /** Permission that opens the page; missing: everyone. */
  perm?: string;
}

const WARM: Warm[] = [
  { path: '/sales/?page=1&page_size=100', perm: 'sales.view' },
  { path: '/customers/?page=1&page_size=100', perm: 'sales.view' },
  { path: '/sales/bikes/?status=in_stock&page=1&page_size=100', perm: 'sales.view' },
  { path: '/sales/local-products/?page=1&page_size=100', perm: 'sales.view' },
  { path: '/inventory/stock/', perm: 'inventory.view' },
  { path: '/purchases/?page=1&page_size=100', perm: 'purchases.view' },
  { path: '/suppliers/?page=1&page_size=100', perm: 'purchases.view' },
  { path: '/finance/expenses/?page=1&page_size=100', perm: 'finance.view' },
  { path: '/finance/expenses/summary/', perm: 'finance.view' },
  { path: '/staff/?page=1&page_size=100', perm: 'staff.view' },
  { path: '/positions/?page=1&page_size=100', perm: 'staff.view' },
  { path: '/tasks/summary/' },
  { path: '/businesses/branches/' },
];

const FLAG = 'vgsync.warm.at';
const EVERY_MS = 10 * 60_000;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const idle = () =>
  new Promise<void>((r) =>
    'requestIdleCallback' in window ? (window as Window).requestIdleCallback(() => r(), { timeout: 4000 }) : setTimeout(r, 300),
  );

export async function warmUp(): Promise<void> {
  try {
    const last = Number(sessionStorage.getItem(FLAG) ?? 0);
    if (Date.now() - last < EVERY_MS || navigator.onLine === false) return;
    sessionStorage.setItem(FLAG, String(Date.now()));
  } catch {
    return;
  }
  const s = getSession();
  if (!s) return;

  await pause(2500);
  for (const w of WARM) {
    if (w.perm && !s.isOwner && !s.permissions.includes(w.perm)) continue;
    await idle();
    if (!navigator.onLine) return;
    try {
      await api(w.path);
    } catch {
      /* not allowed here, or offline: skip */
    }
    await pause(350);
  }
}
