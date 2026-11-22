/**
 * Fills the saved copy in the background after sign-in, so the first visit to
 * each page is already instant. One request at a time, only while the browser
 * is idle, only for what this person is allowed to open, and only once in a
 * while per tab. Any failure is ignored.
 */

import { api, primeCache } from './api';
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
  { path: '/inventory/transfers/?page_size=100&page=1', perm: 'orders.view' },
  { path: '/tasks/summary/' },
  { path: '/businesses/branches/' },
];

/** The pages themselves, kept for offline opening (the service worker saves each one it sees). */
const PAGES: Warm[] = [
  { path: '/sales', perm: 'sales.view' },
  { path: '/customers', perm: 'sales.view' },
  { path: '/inventory', perm: 'inventory.view' },
  { path: '/purchase', perm: 'purchases.view' },
  { path: '/suppliers', perm: 'purchases.view' },
  { path: '/payments', perm: 'finance.view' },
  { path: '/staff', perm: 'staff.view' },
  { path: '/tasks' },
  { path: '/orders' },
  { path: '/branches' },
];

const FLAG = 'vgsync.warm.at';
const EVERY_MS = 10 * 60_000;
const PARALLEL = 4; // right after sign-in: a few at once, not all at once

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const idle = () =>
  new Promise<void>((r) =>
    'requestIdleCallback' in window ? (window as Window).requestIdleCallback(() => r(), { timeout: 4000 }) : setTimeout(r, 300),
  );

/** Tells the loading popup how much warm-up work there is and how far it is. */
function report(total: number, started: number, done: number): void {
  window.dispatchEvent(new CustomEvent('vg:warm', { detail: { total, started, done } }));
}

async function fetchOne(w: Warm): Promise<void> {
  try {
    await api(w.path, { keepAfterLeave: true });
  } catch {
    /* not allowed here, or offline: skip */
  }
}

type Session = NonNullable<ReturnType<typeof getSession>>;

/** The popup is closing; now quietly keep the pages themselves for offline use. */
async function keepPages(s: Session): Promise<void> {
  for (const w of PAGES) {
    if (w.perm && !s.isOwner && !s.permissions.includes(w.perm)) continue;
    if (!navigator.onLine) return;
    try {
      await fetch(w.path, { headers: { Accept: 'text/html' } });
    } catch {
      /* offline: skip */
    }
    await pause(200);
  }
}

/** Asks for the first-load packet and saves each list in it. False when that did not work. */
async function fromPacket(list: Warm[]): Promise<boolean> {
  try {
    const packet = await api<{ items: Record<string, unknown> }>('/bootstrap/', { keepAfterLeave: true });
    const wanted = new Set(list.map((w) => w.path));
    const saves = Object.entries(packet.items ?? {})
      .filter(([path]) => wanted.has(path))
      .map(([path, data]) => primeCache(path, data));
    await Promise.all(saves);
    return saves.length > 0;
  } catch {
    return false;
  }
}

/**
 * right after sign-in (`eager`): everything this person can open is fetched at once
 * (a few at a time) while the loading popup is up. Otherwise: quietly, one at a
 * time while the browser is idle, and only once in a while.
 */
export async function warmUp(eager = false): Promise<void> {
  try {
    const last = Number(sessionStorage.getItem(FLAG) ?? 0);
    if ((!eager && Date.now() - last < EVERY_MS) || navigator.onLine === false) return;
    sessionStorage.setItem(FLAG, String(Date.now()));
  } catch {
    return;
  }
  const s = getSession();
  if (!s) return;

  const list = WARM.filter((w) => !w.perm || s.isOwner || s.permissions.includes(w.perm));

  if (eager) {
    // One request brings every list this person may open (see backend /bootstrap/).
    report(list.length, 0, 0);
    const got = await fromPacket(list);
    if (got) {
      report(list.length, list.length, list.length);
      await keepPages(s);
      return;
    }

    // Older server or a failed packet: ask for the lists one by one, a few at a time.
    let next = 0;
    let started = 0;
    let done = 0;
    report(list.length, 0, 0);
    const lane = async () => {
      while (next < list.length && navigator.onLine) {
        const w = list[next++];
        started++;
        report(list.length, started, done);
        await fetchOne(w);
        done++;
        report(list.length, started, done);
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, lane));
    report(list.length, started, list.length); // finished, even if some were skipped
    await keepPages(s);
    return;
  }

  await pause(2500);
  for (const w of list) {
    await idle();
    if (!navigator.onLine) return;
    await fetchOne(w);
    await pause(350);
  }
}
