/**
 * Shimmer placeholders. Pages start with a plain "Loading…" in every table,
 * list and title; this turns each of them into a shimmering skeleton until the
 * page's own script puts real data there (which replaces the placeholder).
 */

const LOADING = /^Loading…?$/;

function bar(width: string, height = '12px'): string {
  return `<span class="sk-bar" style="width:${width};height:${height}"></span>`;
}

const WIDTHS = ['70%', '45%', '60%', '35%', '55%', '40%', '65%', '30%'];

function skeletonize(el: HTMLElement): void {
  if (el.tagName === 'TD') {
    const tr = el.closest('tr');
    const cols = Math.min(12, Math.max(2, Number(el.getAttribute('colspan')) || tr?.children.length || 4));
    if (!tr) return;
    const rows = Array.from({ length: 5 }, (_, r) =>
      `<tr class="sk-row" aria-hidden="true">${Array.from({ length: cols }, (_, c) => `<td>${bar(WIDTHS[(r + c * 3) % WIDTHS.length])}</td>`).join('')}</tr>`,
    ).join('');
    tr.outerHTML = rows;
    return;
  }
  if (/^H[1-6]$/.test(el.tagName)) {
    el.innerHTML = bar('min(220px, 60%)', '1.1em');
    return;
  }
  el.innerHTML = [bar('80%'), bar('55%'), bar('68%')].map((b) => `<span class="sk-line">${b}</span>`).join('');
}

function scan(root: ParentNode): void {
  const found: HTMLElement[] = [];
  root.querySelectorAll<HTMLElement>('td, li, p, h1, h2, h3, div, span').forEach((el) => {
    if (el.childElementCount === 0 && LOADING.test((el.textContent ?? '').trim())) found.push(el);
  });
  found.forEach((el) => {
    if (el.isConnected) skeletonize(el);
  });
}

function start(): void {
  const host = document.getElementById('app-content') ?? document.body;
  scan(host);
  new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => {
        if (n instanceof HTMLElement) {
          if (LOADING.test((n.textContent ?? '').trim()) && n.childElementCount === 0) skeletonize(n);
          else scan(n);
        }
      });
    }
  }).observe(host, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
