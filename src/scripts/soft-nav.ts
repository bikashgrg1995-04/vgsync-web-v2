/**
 * Moving between dashboard pages swaps only the page content. The sidebar,
 * header, theme, notifications and sign-in stay where they are; the new
 * page's styles and script are loaded and the old page's listeners removed.
 * Anything that goes wrong falls back to an ordinary full page load.
 */
import { refreshMenuGroups } from './app-shell';

type Tracked = {
  target: EventTarget;
  type: string;
  listener: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
};

let tracking = false;
let tracked: Tracked[] = [];
let counter = 0;
let token = 0;

// Page scripts that have already run (the one this page loaded with counts).
const executed = new Set<string>();
// Pages fetched ahead of the click (on hover or touch), kept briefly.
const prefetched = new Map<string, { at: number; html: Promise<string> }>();
const FRESH_MS = 20_000;

// The page (path and query, no #fragment) on screen now.
let shown = window.location.pathname + window.location.search;

const keyOf = (url: string) => {
  const u = new URL(url, window.location.href);

  return u.pathname + u.search;
};

const content = () => document.querySelector<HTMLElement>('.app-content-inner');

// Listeners a page puts on the document, window or the shared header would
// outlive the page; remember them so they can be removed when it is left.
const nativeAdd = EventTarget.prototype.addEventListener;

EventTarget.prototype.addEventListener = function (
  this: EventTarget,
  type: string,
  listener: EventListenerOrEventListenerObject | null,
  options?: boolean | AddEventListenerOptions,
): void {
  if (tracking && listener) {
    const inside = this instanceof Node && this !== document && !!content()?.contains(this);

    if (!inside) tracked.push({ target: this, type, listener, options });
  }

  nativeAdd.call(this, type, listener as EventListenerOrEventListenerObject, options);
} as typeof EventTarget.prototype.addEventListener;

function teardown(): void {
  for (const t of tracked) t.target.removeEventListener(t.type, t.listener, t.options);
  tracked = [];
}

function headKey(node: Element): string {
  return node.tagName === 'LINK'
    ? `link:${(node as HTMLLinkElement).getAttribute('href')}`
    : `style:${node.getAttribute('data-vite-dev-id') ?? node.textContent}`;
}

const headStyles = (root: ParentNode) =>
  Array.from(root.querySelectorAll<Element>('link[rel="stylesheet"], style'));

function syncStyles(next: Document): void {
  const wanted = new Map(headStyles(next.head).map((n) => [headKey(n), n]));
  const have = new Map(headStyles(document.head).map((n) => [headKey(n), n]));

  // Never remove what the page came with (the dev server also adds the shared
  // styles from script, so they may be missing from a fetched copy); only
  // drop styles an earlier soft navigation added that this page does not use.
  for (const [key, node] of have) if (node.hasAttribute('data-soft') && !wanted.has(key)) node.remove();
  for (const [key, node] of wanted) {
    if (have.has(key)) continue;

    const copy = document.importNode(node, true) as Element;

    copy.setAttribute('data-soft', '');
    document.head.appendChild(copy);
  }
}

function isLayoutScript(el: HTMLScriptElement): boolean {
  const src = el.getAttribute('src') ?? '';

  return src.includes('AppLayout.astro') || (!src && /app-shell|sidebar-toggle/.test(el.textContent ?? ''));
}

// The dev server also lists stylesheets and its own client as module scripts;
// those are not page code (the styles come across with the head).
function isTooling(el: HTMLScriptElement): boolean {
  const path = (el.getAttribute('src') ?? '').split('?')[0];

  return path.endsWith('.css') || path.startsWith('/@');
}

function pageScripts(next: Document): HTMLScriptElement[] {
  return Array.from(next.querySelectorAll<HTMLScriptElement>('script[type="module"]')).filter(
    (s) => !isLayoutScript(s) && !isTooling(s),
  );
}

async function runScripts(scripts: HTMLScriptElement[]): Promise<void> {
  for (const s of scripts) {
    const src = s.getAttribute('src');

    if (src) {
      const url = new URL(src, window.location.origin);
      const plain = url.pathname + url.search;

      // First run uses the plain address, which the browser has usually
      // preloaded; running it again needs a fresh copy of the module.
      if (executed.has(plain)) url.searchParams.set('soft', String(++counter));
      else executed.add(plain);
      await import(/* @vite-ignore */ url.pathname + url.search);
    } else {
      const el = document.createElement('script');

      el.type = 'module';
      el.textContent = s.textContent;
      document.body.appendChild(el);
    }
  }
}

function syncChrome(next: Document): void {
  document.title = next.title;

  for (const sel of ['.header-title', '.header-breadcrumb']) {
    const to = document.querySelector(sel);
    const from = next.querySelector(sel);

    if (to && from) to.textContent = from.textContent;
  }

  const activeId = next.querySelector('.sidebar-link.is-active')?.getAttribute('data-nav-id');

  document.querySelectorAll<HTMLElement>('.app-sidebar .sidebar-link').forEach((a) => {
    const on = !!activeId && a.dataset.navId === activeId;

    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  document.getElementById('app-shell')?.classList.remove('sidebar-open');
  refreshMenuGroups();
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { credentials: 'same-origin' });

  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html')) throw new Error('not a page');

  return res.text();
}

function preloadScripts(html: string): void {
  const next = new DOMParser().parseFromString(html, 'text/html');

  for (const s of pageScripts(next)) {
    const src = s.getAttribute('src');

    if (!src || document.querySelector(`link[rel="modulepreload"][href="${src}"]`)) continue;

    const link = document.createElement('link');

    link.rel = 'modulepreload';
    link.href = src;
    document.head.appendChild(link);
  }
}

function prefetch(url: string): void {
  const key = keyOf(url);
  const hit = prefetched.get(key);

  if (hit && Date.now() - hit.at < FRESH_MS) return;

  const html = fetchHtml(url);

  html.then(preloadScripts, () => prefetched.delete(key));
  prefetched.set(key, { at: Date.now(), html });
}

async function go(url: string, push: boolean): Promise<void> {
  const mine = ++token;
  const shell = document.getElementById('app-shell');

  shell?.classList.add('is-navigating');

  try {
    const hit = prefetched.get(keyOf(url));
    const html = await (hit && Date.now() - hit.at < FRESH_MS ? hit.html : fetchHtml(url));

    prefetched.delete(keyOf(url));

    const next = new DOMParser().parseFromString(html, 'text/html');
    const incoming = next.querySelector('.app-content-inner');

    if (!incoming || !next.getElementById('app-shell')) throw new Error('not a dashboard page');
    if (mine !== token) return; // a later click won

    teardown();
    syncStyles(next);
    content()!.innerHTML = incoming.innerHTML;
    if (push) window.history.pushState({ soft: true }, '', url);
    shown = keyOf(window.location.href);
    syncChrome(next);
    window.scrollTo({ top: 0 });
    document.getElementById('app-content')?.scrollTo({ top: 0 });
    await runScripts(pageScripts(next));
  } catch {
    window.location.assign(url);
    return;
  } finally {
    if (mine === token) shell?.classList.remove('is-navigating');
  }
}

function eligible(a: HTMLAnchorElement, e: MouseEvent): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (a.target && a.target !== '_self') return false;
  if (a.hasAttribute('download') || a.hasAttribute('data-no-soft')) return false;

  const u = new URL(a.href, window.location.href);

  const bare = u.pathname.replace(/\/+$/, '') || '/';
  // Sign-in and password pages are outside the app shell: load them normally.
  if (u.origin !== window.location.origin || ['/', '/forgot-password', '/reset-password'].includes(bare)) return false;
  // Only a #fragment change on this page: the browser handles it.
  if (u.pathname === window.location.pathname && u.search === window.location.search) return false;

  return true;
}

document.addEventListener('click', (e) => {
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;

  if (!a) return;

  // Back to this page's plain address from one of its #tabs: stay on the page
  // and let it return to its first view.
  const to = new URL(a.href, window.location.href);

  if (
    !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey &&
    (!a.target || a.target === '_self') && to.origin === window.location.origin && !to.hash &&
    to.pathname === window.location.pathname && to.search === window.location.search && window.location.hash
  ) {
    e.preventDefault();
    window.history.pushState({ soft: true }, '', to.pathname + to.search);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }

  if (!eligible(a, e)) return;

  e.preventDefault();
  markActive(a);
  void go(a.href, true);
});

// Reach for the page as soon as a link is pointed at or touched.
const warm = (e: Event) => {
  const a = (e.target as Element | null)?.closest?.('.app-sidebar a[href]') as HTMLAnchorElement | null;

  if (a && eligible(a, new MouseEvent('click'))) prefetch(a.href);
};

document.addEventListener('mouseover', warm, { passive: true });
document.addEventListener('touchstart', warm, { passive: true });
document.addEventListener('focusin', warm);

// Highlight the clicked item at once; the real highlight follows the page.
function markActive(a: HTMLAnchorElement): void {
  const id = a.dataset.navId;

  if (!id || !a.closest('.app-sidebar')) return;
  document.querySelectorAll('.app-sidebar .sidebar-link').forEach((x) => x.classList.toggle('is-active', x === a));
}

// Back/forward. A change of #fragment alone also raises popstate; that stays
// on the same page, so there is nothing to load.
window.addEventListener('popstate', () => {
  if (keyOf(window.location.href) === shown) return;
  void go(window.location.href, false);
});

for (const s of pageScripts(document)) {
  const src = s.getAttribute('src');

  if (src) executed.add(new URL(src, window.location.origin).pathname + new URL(src, window.location.origin).search);
}

// From here on, whatever a page registers is the page's own.
tracking = true;
