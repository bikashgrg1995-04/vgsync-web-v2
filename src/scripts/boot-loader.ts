/**
 * First load after signing in: a popup over the (shimmering) page that says
 * what is happening and shows real progress, based on the requests the page
 * is making. It closes by itself when they finish, and never stays more than
 * a few seconds. Only shown right after sign-in, not on later visits.
 */

import { firstLoad } from '../lib/first-load';

const MIN_MS = 900; // long enough to read, short enough not to get in the way
const MAX_MS = 15_000;

const STEPS: Array<[number, string]> = [
  [0, 'Signing you in securely…'],
  [20, 'Loading your dashboard…'],
  [45, 'Getting your stock and inventory…'],
  [68, 'Getting sales, customers and purchases…'],
  [88, 'Almost ready…'],
];

// Listen from the very start: the first requests are sent before the popup exists.
let started = 0;
let done = 0;
let warm = { total: 0, started: 0, done: 0 };
if (firstLoad) {
  window.addEventListener('vg:net', (e) => {
    const d = (e as CustomEvent<{ started: number; done: number }>).detail;
    started = d.started;
    done = d.done;
  });
  window.addEventListener('vg:warm', (e) => {
    warm = (e as CustomEvent<typeof warm>).detail;
  });
}

function start(): void {
  const found = document.getElementById('boot-overlay');
  if (!found) return;
  const root: HTMLElement = found;

  const fill = root.querySelector<HTMLElement>('#boot-fill')!;
  const msg = root.querySelector<HTMLElement>('#boot-msg')!;
  const pct = root.querySelector<HTMLElement>('#boot-pct')!;

  const t0 = performance.now();
  let shown = 0; // what the bar shows now, only ever goes up
  let finished = false;
  let idleSince = 0;

  function frame(now: number): void {
    const age = now - t0;
    const pending = started - done;
    // Page requests plus the data fetched for the other pages (announced up front).
    const total = started - warm.started + warm.total;
    const warming = warm.total > 0 && warm.done < warm.total;

    // Real part: share of requests finished. The rest creeps forward so the bar
    // never looks stuck while a slow request is on its way.
    const real = total ? (Math.min(done, total) / total) * 90 : 0;
    const creep = Math.min(88, 8 + age / 60);
    const target = finished ? 100 : Math.min(real, 90) > creep ? Math.min(real, 90) : Math.min(creep, real + 12);

    shown = Math.max(shown, shown + (target - shown) * 0.12);
    fill.style.width = `${shown.toFixed(1)}%`;
    pct.textContent = `${Math.round(shown)}%`;
    for (const [from, text] of STEPS) if (shown >= from && msg.textContent !== text && !finished) msg.textContent = text;

    if (!finished) {
      if (started > 0 && pending === 0 && !warming) idleSince ||= now;
      else idleSince = 0;
      const quiet = idleSince && now - idleSince > 450;
      // Also wait until the page behind has swapped its shimmer for real data.
      const shimmering = Array.from(document.querySelectorAll('#app-content .sk-bar')).some((e) => (e as HTMLElement).offsetParent !== null);
      if ((age > MIN_MS && quiet && !shimmering) || age > MAX_MS) {
        finished = true;
        msg.textContent = 'All set';
      }
    } else if (shown > 99) {
      pct.textContent = '100%';
      root.classList.add('is-leaving');
      setTimeout(() => {
        document.documentElement.classList.remove('vg-booting');
        root.remove();
      }, 350);
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (firstLoad) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}
