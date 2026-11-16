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

  for (const [key, node] of have) if (!wanted.has(key)) node.remove();
  for (const [key, node] of wanted) if (!have.has(key)) document.head.appendChild(document.importNode(node, true));
}

function isLayoutScript(el: HTMLScriptElement): boolean {
  const src = el.getAttribute('src') ?? '';

  return src.includes('AppLayout.astro') || (!src && /app-shell|sidebar-toggle/.test(el.textContent ?? ''));
}

function pageScripts(next: Document): HTMLScriptElement[] {
  return Array.from(next.querySelectorAll<HTMLScriptElement>('script[type="module"]')).filter((s) => !isLayoutScript(s));
}

async function runScripts(scripts: HTMLScriptElement[]): Promise<void> {
  for (const s of scripts) {
    const src = s.getAttribute('src');

    if (src) {
      const url = new URL(src, window.location.origin);

      url.searchParams.set('soft', String(++counter));
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

async function go(url: string, push: boolean): Promise<void> {
  const mine = ++token;
  const shell = document.getElementById('app-shell');

  shell?.classList.add('is-navigating');

  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    const type = res.headers.get('content-type') ?? '';

    if (!res.ok || !type.includes('text/html')) throw new Error('not a page');

    const next = new DOMParser().parseFromString(await res.text(), 'text/html');
    const incoming = next.querySelector('.app-content-inner');

    if (!incoming || !next.getElementById('app-shell')) throw new Error('not a dashboard page');
    if (mine !== token) return; // a later click won

    teardown();
    syncStyles(next);
    content()!.innerHTML = incoming.innerHTML;
    if (push) window.history.pushState({ soft: true }, '', url);
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

  if (u.origin !== window.location.origin || !u.pathname.startsWith('/dashboard')) return false;
  // Only a #fragment change on this page: the browser handles it.
  if (u.pathname === window.location.pathname && u.search === window.location.search) return false;

  return true;
}

document.addEventListener('click', (e) => {
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;

  if (!a || !eligible(a, e)) return;

  e.preventDefault();
  void go(a.href, true);
});

window.addEventListener('popstate', () => {
  void go(window.location.href, false);
});

// From here on, whatever a page registers is the page's own.
tracking = true;
