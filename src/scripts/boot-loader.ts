/**
 * First load after signing in: a popup over the (shimmering) page that says
 * what is happening and shows real progress, based on the requests the page
 * is making. It closes by itself when they finish, and never stays more than
 * a few seconds. Only shown right after sign-in, not on later visits.
 */

export {};

const FLAG = 'vg:welcome';
const MIN_MS = 900; // long enough to read, short enough not to get in the way
const MAX_MS = 12_000;

const STEPS: Array<[number, string]> = [
  [0, 'Signing you in securely…'],
  [25, 'Loading your dashboard…'],
  [55, 'Getting your branch and stock…'],
  [85, 'Almost ready…'],
];

function wanted(): boolean {
  try {
    if (sessionStorage.getItem(FLAG) !== '1') return false;
    sessionStorage.removeItem(FLAG);
    return true;
  } catch {
    return false;
  }
}

function start(): void {
  const root = document.createElement('div');
  root.className = 'boot-overlay';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = `
    <div class="boot-card">
      <div class="boot-spinner" aria-hidden="true"><span></span><span></span><span></span></div>
      <h2 class="boot-title">Setting things up</h2>
      <p class="boot-msg" id="boot-msg">${STEPS[0][1]}</p>
      <div class="boot-track" aria-hidden="true"><i class="boot-fill" id="boot-fill"></i></div>
      <p class="boot-pct" id="boot-pct">0%</p>
    </div>`;
  document.body.appendChild(root);

  const fill = root.querySelector<HTMLElement>('#boot-fill')!;
  const msg = root.querySelector<HTMLElement>('#boot-msg')!;
  const pct = root.querySelector<HTMLElement>('#boot-pct')!;

  const t0 = performance.now();
  let started = 0;
  let done = 0;
  let shown = 0; // what the bar shows now, only ever goes up
  let finished = false;
  let idleSince = 0;

  window.addEventListener('vg:net', (e) => {
    const d = (e as CustomEvent<{ started: number; done: number }>).detail;
    started = d.started;
    done = d.done;
  });

  function frame(now: number): void {
    const age = now - t0;
    const pending = started - done;

    // Real part: share of requests finished. The rest creeps forward so the bar
    // never looks stuck while a slow request is on its way.
    const real = started ? (done / started) * 90 : 0;
    const creep = Math.min(88, 8 + age / 60);
    const target = finished ? 100 : Math.min(real, 90) > creep ? Math.min(real, 90) : Math.min(creep, real + 12);

    shown = Math.max(shown, shown + (target - shown) * 0.12);
    fill.style.width = `${shown.toFixed(1)}%`;
    pct.textContent = `${Math.round(shown)}%`;
    for (const [from, text] of STEPS) if (shown >= from && msg.textContent !== text && !finished) msg.textContent = text;

    if (!finished) {
      if (started > 0 && pending === 0) idleSince ||= now;
      else idleSince = 0;
      const quiet = idleSince && now - idleSince > 450;
      if ((age > MIN_MS && quiet) || age > MAX_MS) {
        finished = true;
        msg.textContent = 'All set';
      }
    } else if (shown > 99) {
      pct.textContent = '100%';
      root.classList.add('is-leaving');
      setTimeout(() => root.remove(), 350);
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (wanted()) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}
