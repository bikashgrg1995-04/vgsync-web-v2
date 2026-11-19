import { getSession } from '../../lib/auth';
import { apiDownload } from '../../lib/api';
import {
  $,
  val,
  today,
  esc,
  describe,
  showError,
  dlg,
  submit,
  configurePurchaseDialogs,
  openForm,
  openReason,
  addLineRow,
  readLines,
} from '../widgets/purchase-dialogs';
import { listSuppliers, type Supplier } from '../../lib/suppliers';
import { listStock, createProductReturningId, type StockItem } from '../../lib/inventory';
import {
  listPurchases,
  createPurchase,
  readPurchaseFile,
  type ImportedLine,
  listReturns,
  voidReturn,
  listCredits,
  useCredit,
  receiveReplacement,
  voidCredit,
  summarize,
  formatNpr,
  formatQty,
  STATUS_LABEL,
  PAYMENT_LABEL,
  METHOD_LABEL,
  CREDIT_LABEL,
  type Purchase,
  type PurchaseReturn,
  type CreditSettlement,
  type CreditKind,
  type PayMethod,
} from '../../lib/purchases';

if (!getSession()) window.location.replace('/');

let purchases: Purchase[] = [];
let allPurchases: Purchase[] = [];
let returns: PurchaseReturn[] = [];
let credits: CreditSettlement[] = [];
let suppliers: Supplier[] = [];
let products: StockItem[] = [];
let canWrite = true;
let loaded = { returns: false, credits: false };

function notice(message: string | null, error = false): void {
  const el = $('pu-notice');
  if (!el) return;
  el.hidden = !message;
  el.textContent = message ?? '';
  el.classList.toggle('is-error', error);
}

const badge = (cls: string, text: string) => `<span class="pu-badge pu-badge-${cls}">${esc(text)}</span>`;

// ---- List ----------------------------------------------------------

function filters() {
  return {
    search: val('f-search').trim(),
    status: val('f-status') as Purchase['status'] | '',
    paymentStatus: val('f-pay') as Purchase['paymentStatus'] | '',
    supplierId: Number(val('f-supplier')) || undefined,
    dateFrom: val('f-from'),
    dateTo: val('f-to'),
  };
}

// ---- Overview ------------------------------------------------------

const PO_PAGE_SIZE = 4;
let poPage = 1;

const DAY_MS = 86_400_000;

function parseDay(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

function fmtDate(s: string): string {
  const d = parseDay(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} • ${time}`;
}

function dayStart(d = new Date()): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole days between today and a purchase date (0 = today). */
function daysAgo(s: string): number {
  return Math.round((dayStart() - parseDay(s).getTime()) / DAY_MS);
}

const live = () => allPurchases.filter((p) => p.status !== 'cancelled');

/** Purchases dated within [from, to] days ago, cancelled ones left out. */
function inWindow(fromDaysAgo: number, toDaysAgo: number): Purchase[] {
  return live().filter((p) => {
    const n = daysAgo(p.purchaseDate);
    return n >= toDaysAgo && n <= fromDaysAgo;
  });
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(Math.round(n));
}

function setTrend(id: string, current: number, previous: number): void {
  const el = $(id);
  if (!el) return;

  el.className = 'pd-trend';

  if (previous <= 0) {
    el.textContent = current > 0 ? 'New' : '';
    if (current > 0) el.classList.add('is-up');
    return;
  }

  const pct = ((current - previous) / previous) * 100;
  const flat = Math.abs(pct) < 0.05;

  el.textContent = `${flat ? '' : pct > 0 ? '↑ ' : '↓ '}${Math.abs(pct).toFixed(1)}%`;
  el.classList.add(flat ? 'is-flat' : pct > 0 ? 'is-up' : 'is-down');
}

function renderKpis(): void {
  const now = inWindow(29, 0);
  const before = inWindow(59, 30);

  const sum = (list: Purchase[]) => list.reduce((t, p) => t + p.netTotal, 0);

  $('kpi-total')!.textContent = formatNpr(sum(now));
  setTrend('kpi-total-trend', sum(now), sum(before));

  $('kpi-orders')!.textContent = String(now.length);
  setTrend('kpi-orders-trend', now.length, before.length);

  const active = suppliers.filter((x) => x.isActive).length;
  const ordered = new Set(now.map((p) => p.supplierId)).size;

  $('kpi-suppliers')!.textContent = String(active);
  $('kpi-suppliers-sub')!.textContent = `${ordered} ordered from in last 30 days`;

  const pending = summarize(allPurchases).toReceive;
  const sub = $('kpi-pending-sub')!;

  $('kpi-pending')!.textContent = String(pending);
  sub.textContent = pending > 0 ? 'Requires attention' : 'Nothing waiting';
  sub.classList.toggle('is-warn', pending > 0);
}

function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

function niceMax(v: number): number {
  if (v <= 0) return 1000;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const step = pow / 2;
  return Math.ceil(v / step) * step;
}

function rangeDays(): number {
  return Number($<HTMLSelectElement>('pd-range')?.value ?? 30);
}

function renderChart(): void {
  const host = $('pd-chart');
  if (!host) return;

  const days = rangeDays();

  // Group days into buckets so sparse purchase dates still draw a readable line.
  const size = days <= 7 ? 1 : days <= 30 ? 3 : 7;
  const count = Math.ceil(days / size);
  const thisP = new Array<number>(count).fill(0);
  const lastP = new Array<number>(count).fill(0);

  for (const p of live()) {
    const n = daysAgo(p.purchaseDate);
    if (n >= 0 && n < days) thisP[count - 1 - Math.floor(n / size)] += p.netTotal;
    else if (n >= days && n < days * 2) lastP[count - 1 - Math.floor((n - days) / size)] += p.netTotal;
  }

  const W = 560, H = 230, padL = 44, padR = 14, padT = 14, padB = 28;
  const yMax = niceMax(Math.max(...thisP, ...lastP));
  const x = (i: number) => padL + (count <= 1 ? 0 : (i / (count - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - v / yMax) * (H - padT - padB);

  const thisPts = thisP.map((v, i): [number, number] => [x(i), y(v)]);
  const lastPts = lastP.map((v, i): [number, number] => [x(i), y(v)]);

  const grid = [0, 1 / 3, 2 / 3, 1]
    .map((f) => `<line x1="${padL}" x2="${W - padR}" y1="${y(yMax * f)}" y2="${y(yMax * f)}" class="pd-grid-line" />
      <text x="${padL - 8}" y="${y(yMax * f) + 3}" text-anchor="end" class="pd-axis">${compact(yMax * f)}</text>`)
    .join('');

  const every = Math.max(1, Math.ceil(count / 4));
  const ticks = thisP
    .map((_, i) => {
      if (i % every !== 0 && i !== count - 1) return '';
      // Label each bucket by its last day.
      const ago = (count - 1 - i) * size;
      const d = new Date(dayStart() - ago * DAY_MS);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="pd-axis">${label}</text>`;
    })
    .join('');

  const dots = (pts: [number, number][], cls: string) =>
    pts.map(([px, py]) => `<circle cx="${px}" cy="${py}" r="3.2" class="${cls}" />`).join('');

  const empty = thisP.every((v) => v === 0) && lastP.every((v) => v === 0);

  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Purchases per day, this period and last period" preserveAspectRatio="xMidYMid meet">
    ${grid}
    <path d="${smoothPath(lastPts)}" class="pd-line-last" />
    <path d="${smoothPath(thisPts)}" class="pd-line-this" />
    ${dots(lastPts, 'pd-dot-last')}
    ${dots(thisPts, 'pd-dot-this')}
    ${ticks}
  </svg>${empty ? '<p class="pd-chart-empty">No purchases in this period</p>' : ''}`;
}

function renderSuppliers(): void {
  const el = $('pd-suppliers');
  if (!el) return;

  const days = rangeDays();
  const totals = new Map<string, number>();

  for (const p of inWindow(days - 1, 0)) {
    totals.set(p.supplierName, (totals.get(p.supplierName) ?? 0) + p.netTotal);
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const grand = sorted.reduce((t, [, v]) => t + v, 0);

  if (sorted.length === 0 || grand <= 0) {
    el.innerHTML = '<li class="pd-empty-note">No supplier purchases in this period.</li>';
    return;
  }

  let rows = sorted;
  if (sorted.length > 5) {
    const others = sorted.slice(4).reduce((t, [, v]) => t + v, 0);
    rows = [...sorted.slice(0, 4), ['Others', others]];
  }

  el.innerHTML = rows
    .map(([name, amount], i) => {
      const pct = (amount / grand) * 100;
      return `<li class="pd-supplier">
        <span class="pd-rank">${i + 1}</span>
        <span class="pd-supplier-name">${esc(name)}</span>
        <span class="pd-supplier-amount">${formatNpr(amount)}</span>
        <span class="pd-supplier-pct">${pct.toFixed(1)}%</span>
        <span class="pd-bar"><i style="width:${Math.max(2, pct).toFixed(1)}%"></i></span>
      </li>`;
    })
    .join('');
}

const ACT_ICONS = {
  received: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"></circle><circle cx="18" cy="20" r="1.4"></circle><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6"></path></svg>',
  new: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path><path d="M9 13h6"></path><path d="M9 17h6"></path></svg>',
  cancelled: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg>',
};

function renderActivity(): void {
  const el = $('pd-activity');
  if (!el) return;

  type Event = { when: string; kind: 'received' | 'new' | 'cancelled'; title: string; no: string };
  const events: Event[] = [];

  for (const p of allPurchases) {
    events.push({ when: p.createdAt ?? `${p.purchaseDate}T00:00:00`, kind: 'new', title: 'New purchase order', no: p.purchaseNo });
    if (p.receivedAt) events.push({ when: p.receivedAt, kind: 'received', title: 'Purchase received', no: p.purchaseNo });
    if (p.cancelledAt) events.push({ when: p.cancelledAt, kind: 'cancelled', title: 'Purchase cancelled', no: p.purchaseNo });
  }

  events.sort((a, b) => b.when.localeCompare(a.when));

  if (events.length === 0) {
    el.innerHTML = '<li class="pd-empty-note">No activity yet.</li>';
    return;
  }

  el.innerHTML = events
    .slice(0, 3)
    .map(
      (e) => `<li>
        <span class="pd-act-icon is-${e.kind}">${ACT_ICONS[e.kind]}</span>
        <div class="pd-act-body">
          <strong>${esc(e.title)}</strong>
          <span>${esc(e.no)}</span>
          <time>${esc(fmtWhen(e.when))}</time>
        </div>
      </li>`,
    )
    .join('');
}

function poPill(p: Purchase): string {
  if (p.status === 'cancelled') return `<span class="pd-pill pd-pill-cancelled">Cancelled</span>`;
  if (p.status === 'draft') return `<span class="pd-pill pd-pill-draft">Draft</span>`;
  if (p.status === 'partial') return `<span class="pd-pill pd-pill-partial">Part received</span>`;
  if (p.paymentStatus === 'paid') return `<span class="pd-pill pd-pill-received">Completed</span>`;
  return `<span class="pd-pill pd-pill-delivered">Received</span>`;
}

const EYE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';

function renderPager(total: number): void {
  const el = $('pd-pages');
  if (!el) return;

  const pages = Math.max(1, Math.ceil(total / PO_PAGE_SIZE));
  poPage = Math.min(poPage, pages);

  if (pages <= 1) {
    el.innerHTML = '';
    return;
  }

  const items: (number | '…')[] = [];
  for (let n = 1; n <= pages; n++) {
    if (n === 1 || n === pages || Math.abs(n - poPage) <= 1) items.push(n);
    else if (items[items.length - 1] !== '…') items.push('…');
  }

  el.innerHTML =
    `<button type="button" class="pd-pg" data-pg="${poPage - 1}" aria-label="Previous page" ${poPage <= 1 ? 'disabled' : ''}>‹</button>` +
    items
      .map((n) =>
        n === '…'
          ? '<span class="pd-pg-gap">…</span>'
          : `<button type="button" class="pd-pg${n === poPage ? ' is-active' : ''}" data-pg="${n}">${n}</button>`,
      )
      .join('') +
    `<button type="button" class="pd-pg" data-pg="${poPage + 1}" aria-label="Next page" ${poPage >= pages ? 'disabled' : ''}>›</button>`;

  el.querySelectorAll<HTMLButtonElement>('[data-pg]').forEach((b) =>
    b.addEventListener('click', () => {
      poPage = Number(b.dataset.pg);
      renderRecentOrders();
    }),
  );
}

function renderRecentOrders(): void {
  const tbody = $('pd-tbody');
  if (!tbody) return;

  const sorted = [...allPurchases].sort(
    (a, b) => b.purchaseDate.localeCompare(a.purchaseDate) || b.id - a.id,
  );

  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="pu-empty">No purchase orders yet.</td></tr>';
    $('pd-count')!.textContent = 'Showing 0 of 0 orders';
    renderPager(0);
    return;
  }

  const pages = Math.max(1, Math.ceil(sorted.length / PO_PAGE_SIZE));
  poPage = Math.min(poPage, pages);

  const start = (poPage - 1) * PO_PAGE_SIZE;
  const slice = sorted.slice(start, start + PO_PAGE_SIZE);

  tbody.innerHTML = slice
    .map(
      (p) => `<tr>
        <td class="pd-po">${esc(p.purchaseNo)}</td>
        <td>${esc(p.supplierName)}</td>
        <td>${esc(fmtDate(p.purchaseDate))}</td>
        <td>${formatNpr(p.netTotal)}</td>
        <td>${poPill(p)}</td>
        <td class="actions"><button type="button" class="pd-view-btn" data-view="${p.id}">${EYE} View</button></td>
      </tr>`,
    )
    .join('');

  $('pd-count')!.textContent = `Showing ${start + 1}–${start + slice.length} of ${sorted.length} orders`;
  renderPager(sorted.length);

  tbody.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) =>
    b.addEventListener('click', () => openDetail(Number(b.dataset.view))),
  );
}

function renderOverview(): void {
  renderKpis();
  renderChart();
  renderSuppliers();
  renderActivity();
  renderRecentOrders();
}

$('pd-range')?.addEventListener('change', () => {
  renderChart();
  renderSuppliers();
});

/** Downloads every purchase as a CSV file. */
function exportCsv(): void {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [
    ['PO no', 'Date', 'Supplier', 'Bill no', 'Status', 'Payment', 'Net total', 'Paid', 'Due'],
    ...allPurchases.map((p) => [
      p.purchaseNo,
      p.purchaseDate,
      p.supplierName,
      p.billNo,
      STATUS_LABEL[p.status],
      p.status === 'cancelled' ? '' : PAYMENT_LABEL[p.paymentStatus],
      p.netTotal,
      p.paid,
      p.status === 'cancelled' ? '' : p.remaining,
    ]),
  ];

  const blob = new Blob([rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = `purchases-${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

$('pu-export')?.addEventListener('click', exportCsv);

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** The supplier's payment due date, in red once it has passed with money still owed. */
function payBy(p: Purchase): string {
  if (!p.dueDate || p.status === 'cancelled') return '—';
  const late = p.remaining > 0 && p.dueDate < localToday();
  return `<span${late ? ' style="color:#ef4444;font-weight:650"' : ''}>${esc(p.dueDate)}${late ? ' (late)' : ''}</span>`;
}

function renderList(): void {
  const tbody = $('pu-tbody')!;
  if (purchases.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="pu-empty">No purchases found.</td></tr>`;
  } else {
    tbody.innerHTML = purchases
      .map(
        (p) => `<tr class="pu-row" data-id="${p.id}">
          <td class="mono">${esc(p.purchaseNo)}</td>
          <td>${esc(p.purchaseDate)}</td>
          <td>${esc(p.supplierName)}</td>
          <td class="mono">${esc(p.billNo || '—')}</td>
          <td>${badge(p.status, STATUS_LABEL[p.status])}</td>
          <td class="num">${formatNpr(p.netTotal)}</td>
          <td class="num">${formatNpr(p.paid)}</td>
          <td class="num">${p.status === 'cancelled' ? '—' : formatNpr(p.remaining)}</td>
          <td>${payBy(p)}</td>
          <td>${p.status === 'cancelled' ? '—' : badge('pay-' + p.paymentStatus, PAYMENT_LABEL[p.paymentStatus])}</td>
        </tr>`,
      )
      .join('');
  }
  $('pu-count')!.textContent = `${purchases.length} purchase${purchases.length === 1 ? '' : 's'}`;
  tbody.querySelectorAll<HTMLTableRowElement>('.pu-row').forEach((row) =>
    row.addEventListener('click', () => openDetail(Number(row.dataset.id))),
  );
}

async function loadList(): Promise<void> {
  const f = filters();
  const unfiltered = !f.search && !f.status && !f.paymentStatus && !f.supplierId && !f.dateFrom && !f.dateTo;

  try {
    purchases = unfiltered ? allPurchases : await listPurchases(f);
  } catch (error) {
    purchases = [];
    notice(describe(error), true);
  }
  renderList();
}

/** Loads every purchase for the overview, then the list panel. */
async function loadAll(): Promise<void> {
  try {
    allPurchases = await listPurchases();
    notice(canWrite ? null : 'Read-only: you are viewing this branch from Head Office.');
  } catch (error) {
    allPurchases = [];
    notice(describe(error), true);
  }
  renderOverview();
  await loadList();
}

// ---- Detail --------------------------------------------------------

/** A purchase opens on its own page. */
function openDetail(id: number): void {
  window.location.href = `/purchase/detail?id=${id}`;
}

async function refreshAfterChange(_id?: number): Promise<void> {
  await loadAll();
  loaded = { returns: false, credits: false };
  if (activeTab === 'returns') void loadReturns();
  if (activeTab === 'credits') void loadCredits();
  // Stock changed (receive, return): refresh product choices too.
  void listStock().then((s) => (products = s)).catch(() => {});
}

configurePurchaseDialogs({
  getProducts: () => products,
  getSuppliers: () => suppliers,
  onChanged: refreshAfterChange,
});

$('pu-new')?.addEventListener('click', () => openForm());

// ---- Returns tab ---------------------------------------------------

async function loadReturns(): Promise<void> {
  const tbody = $('ret-tbody')!;
  try {
    returns = await listReturns();
    loaded.returns = true;
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="9" class="pu-empty">${esc(describe(error))}</td></tr>`;
    return;
  }
  if (returns.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="pu-empty">No returns yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = returns
    .map((r) => `<tr>
      <td class="mono">${esc(r.returnNo)}</td>
      <td>${esc(r.returnDate)}</td>
      <td class="mono">${esc(r.purchaseNo)}</td>
      <td>${esc(r.supplierName)}</td>
      <td>${r.items.map((i) => `${esc(i.productName)} ×${formatQty(i.quantity)}${i.condition === 'damaged' ? ' (damaged)' : ''}`).join(', ')}</td>
      <td>${esc(r.reason)}</td>
      <td class="num">${formatNpr(r.creditAmount)}</td>
      <td>${r.status === 'void' ? badge('cancelled', 'Voided') : badge('received', 'Active')}</td>
      <td>${r.status === 'active' && canWrite ? `<button class="btn-link is-danger" data-void-ret="${r.id}">Void</button>` : ''}</td>
    </tr>`)
    .join('');
  tbody.querySelectorAll<HTMLButtonElement>('[data-void-ret]').forEach((b) =>
    b.addEventListener('click', () =>
      openReason('Void return', 'The goods go back into stock and the credit is removed.', async (reason) => {
        await voidReturn(Number(b.dataset.voidRet), reason);
      }),
    ),
  );
}

// ---- Credit tab ----------------------------------------------------

async function loadCredits(): Promise<void> {
  const tbody = $('cr-tbody')!;
  try {
    credits = await listCredits();
    loaded.credits = true;
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="pu-empty">${esc(describe(error))}</td></tr>`;
    return;
  }
  if (credits.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="pu-empty">No credit used yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = credits
    .map((c) => {
      const detail =
        c.kind === 'refund'
          ? esc(METHOD_LABEL[c.method as PayMethod] ?? c.method)
          : c.kind === 'adjustment'
            ? `Against ${esc(c.purchaseNo)}`
            : `${c.items.map((i) => `${esc(i.productName)} ×${formatQty(i.quantity)}`).join(', ')} · ${esc(c.deliveryStatus || '')}`;
      const actions: string[] = [];
      if (canWrite && c.status === 'active') {
        if (c.kind === 'replacement' && c.deliveryStatus === 'pending') {
          actions.push(`<button class="btn-link" data-recv-cr="${c.id}">Goods arrived</button>`);
        }
        if (!(c.kind === 'replacement' && c.deliveryStatus === 'received')) {
          actions.push(`<button class="btn-link is-danger" data-void-cr="${c.id}">Void</button>`);
        }
      }
      return `<tr>
        <td>${esc(c.settledOn)}</td>
        <td>${esc(c.supplierName)}</td>
        <td>${esc(CREDIT_LABEL[c.kind])}</td>
        <td>${detail}</td>
        <td class="num">${formatNpr(c.amount)}</td>
        <td>${c.status === 'void' ? badge('cancelled', 'Voided') : badge('received', 'Active')}</td>
        <td class="actions">${actions.join(' ')}</td>
      </tr>`;
    })
    .join('');
  tbody.querySelectorAll<HTMLButtonElement>('[data-recv-cr]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await receiveReplacement(Number(b.dataset.recvCr));
        await refreshAfterChange();
      } catch (error) {
        notice(describe(error), true);
      }
    }),
  );
  tbody.querySelectorAll<HTMLButtonElement>('[data-void-cr]').forEach((b) =>
    b.addEventListener('click', () =>
      openReason('Void credit use', 'The credit goes back to the supplier balance.', async (reason) => {
        await voidCredit(Number(b.dataset.voidCr), reason);
      }),
    ),
  );
}

function syncCreditKind(): void {
  const kind = val('cr-kind') as CreditKind;
  $('cr-method-wrap')!.hidden = kind !== 'refund';
  $('cr-purchase-wrap')!.hidden = kind !== 'adjustment';
  $('cr-items-wrap')!.hidden = kind !== 'replacement';
  if (kind === 'replacement' && $('cr-lines')!.children.length === 0) addLineRow($('cr-lines')!, { price: false });
  if (kind === 'adjustment') {
    const supplierId = Number(val('cr-supplier'));
    const open = purchases.filter((p) => p.supplierId === supplierId && p.status !== 'cancelled' && p.remaining > 0);
    $('cr-purchase')!.innerHTML = open.length
      ? open.map((p) => `<option value="${p.id}">${esc(p.purchaseNo)} · due ${esc(formatNpr(p.remaining))}</option>`).join('')
      : `<option value="">No unpaid purchase for this supplier</option>`;
  }
}

function openCredit(): void {
  $('cr-supplier')!.innerHTML =
    `<option value="">Choose supplier…</option>` + suppliers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $<HTMLSelectElement>('cr-kind')!.value = 'refund';
  $<HTMLInputElement>('cr-amount')!.value = '';
  $<HTMLInputElement>('cr-notes')!.value = '';
  $('cr-lines')!.innerHTML = '';
  syncCreditKind();
  showError('cr-error', null);
  dlg('dlg-credit').showModal();
}

$('cr-new')?.addEventListener('click', openCredit);
$('cr-kind')?.addEventListener('change', syncCreditKind);
$('cr-supplier')?.addEventListener('change', syncCreditKind);
$('cr-add-line')?.addEventListener('click', () => addLineRow($('cr-lines')!, { price: false }));

$('form-credit')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const kind = val('cr-kind') as CreditKind;
  const items = readLines($('cr-lines')!).map((l) => ({ productId: l.productId, quantity: l.quantity }));
  if (kind === 'replacement' && items.length === 0) {
    showError('cr-error', 'Add the replacement goods.');
    return;
  }
  if (kind === 'adjustment' && !Number(val('cr-purchase'))) {
    showError('cr-error', 'Choose a purchase.');
    return;
  }
  void submit('cr-save', 'cr-error', 'dlg-credit', async () => {
    await useCredit({
      supplierId: Number(val('cr-supplier')),
      kind,
      amount: Number(val('cr-amount')),
      method: val('cr-method') as PayMethod,
      purchaseId: Number(val('cr-purchase')) || undefined,
      items,
      notes: val('cr-notes'),
    });
    await refreshAfterChange();
  });
});

// ---- Tabs, filters, load -------------------------------------------

let activeTab = 'overview';


// A menu link that opens one list (Returns, Follow-ups) shows just that
// list under its own title, not the whole Purchase page around it.
const FOCUS: Record<string, { title: string; sub: string; nav: string }> = { returns: { title: 'Purchase Returns', sub: 'Goods sent back to suppliers.', nav: 'purchase-returns' } };
const heroTitle = document.querySelector<HTMLElement>('.pd-hero-title');
const heroSub = document.querySelector<HTMLElement>('.pd-hero-sub');
const headerTitle = document.querySelector<HTMLElement>('.header-title');
const first = {
  title: heroTitle?.textContent ?? '',
  sub: heroSub?.textContent ?? '',
  header: headerTitle?.textContent ?? '',
  nav: document.querySelector('.app-sidebar .sidebar-link.is-active')?.getAttribute('data-nav-id') ?? '',
};
function applyFocus(name: string): void {
  const f = FOCUS[name];
  document.querySelector('.pu-page')?.classList.toggle('is-focus', !!f);
  if (heroTitle) heroTitle.textContent = f ? f.title : first.title;
  if (heroSub) heroSub.textContent = f ? f.sub : first.sub;
  if (headerTitle) headerTitle.textContent = f ? f.title : first.header;
  const nav = f ? f.nav : first.nav;
  document.querySelectorAll<HTMLElement>('.app-sidebar .sidebar-link').forEach((a) => a.classList.toggle('is-active', a.dataset.navId === nav));
}

function showPanel(name: string): void {
  activeTab = name;
  applyFocus(name);
  document.querySelectorAll('.pu-panel').forEach((p) => p.classList.toggle('is-active', (p as HTMLElement).dataset.panel === name));
  if (name === 'returns' && !loaded.returns) void loadReturns();
  if (name === 'credits' && !loaded.credits) void loadCredits();
  window.scrollTo({ top: 0 });
}

document.querySelectorAll<HTMLElement>('[data-goto]').forEach((btn) =>
  btn.addEventListener('click', () => showPanel(btn.dataset.goto!)),
);

$('qa-new')?.addEventListener('click', () => openForm());

let timer: number | undefined;
$('f-search')?.addEventListener('input', () => {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void loadList(), 300);
});
for (const id of ['f-status', 'f-pay', 'f-supplier', 'f-from', 'f-to']) {
  $(id)?.addEventListener('change', () => void loadList());
}
document.getElementById('branch-select')?.addEventListener('change', () => setTimeout(() => void init(), 300));

async function init(): Promise<void> {
  const s = getSession();
  if (s) $('pu-scope')!.textContent = `${s.activeBranchName} (${s.activeBranchCode})`;
  canWrite = s?.accessMode !== 'read_only';
  $('pu-new')!.hidden = !canWrite;
  $('qa-new')!.hidden = !canWrite;
  $('pu-import')!.hidden = !canWrite;
  $('qa-import')!.hidden = !canWrite;
  $('cr-new')!.hidden = !canWrite;
  loaded = { returns: false, credits: false };

  try {
    [suppliers, products] = await Promise.all([listSuppliers(), listStock()]);
  } catch (error) {
    notice(describe(error), true);
  }
  const filt = $<HTMLSelectElement>('f-supplier')!;
  const current = filt.value;
  filt.innerHTML =
    `<option value="">All suppliers</option>` + suppliers.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  filt.value = current;

  await loadAll();
  if (activeTab === 'returns') void loadReturns();
  if (activeTab === 'credits') void loadCredits();
}

// ---- import an order from Excel ------------------------------------------
let poLines: ImportedLine[] = [];

function openPoImport(): void {
  $<HTMLSelectElement>('poi-supplier')!.innerHTML =
    `<option value="">Choose supplier…</option>` + suppliers.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  $<HTMLInputElement>('poi-file')!.value = '';
  ['poi-bill', 'poi-date'].forEach((id) => ($<HTMLInputElement>(id)!.value = ''));
  ['poi-discount', 'poi-vat', 'poi-freight'].forEach((id) => ($<HTMLInputElement>(id)!.value = '0'));
  $('poi-preview')!.innerHTML = '';
  $('poi-error')!.hidden = true;
  $<HTMLButtonElement>('poi-save')!.disabled = true;
  poLines = [];
  $<HTMLDialogElement>('dlg-po-import').showModal();
}

function poError(message: string): void {
  const el = $('poi-error')!;
  el.textContent = message;
  el.hidden = false;
}

async function checkPoFile(): Promise<void> {
  const file = $<HTMLInputElement>('poi-file')!.files?.[0];
  $('poi-error')!.hidden = true;
  $<HTMLButtonElement>('poi-save')!.disabled = true;
  if (!file) return poError('Choose a file first.');
  try {
    const r = await readPurchaseFile(file);
    if (r.errors.length) {
      poLines = [];
      $('poi-preview')!.innerHTML =
        `<p><strong>${r.errors.length} problem${r.errors.length === 1 ? '' : 's'}. Fix the file and check again.</strong></p><ul style="max-height:160px;overflow:auto;padding-left:18px">` +
        r.errors.slice(0, 50).map((e) => `<li>Row ${e.row}: ${esc(e.message)}</li>`).join('') + '</ul>';
      return;
    }
    poLines = r.lines;
    const total = poLines.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
    const fresh = poLines.filter((l) => l.isNew);
    $('poi-preview')!.innerHTML =
      `<table class="pu-table"><thead><tr><th>Stock No</th><th>Item</th><th>Qty</th><th>Unit price</th></tr></thead><tbody>` +
      poLines.map((l) => `<tr${l.isNew ? ' style="background:rgba(245,158,11,.14)"' : ''}><td>${esc(l.stockNo)}${l.isNew ? ' <strong style="color:#b45309">NEW</strong>' : ''}</td><td>${esc(l.name)}</td><td>${formatQty(l.quantity)}</td><td>${formatNpr(l.unitPrice)}</td></tr>`).join('') +
      `</tbody></table><p>${poLines.length} item${poLines.length === 1 ? '' : 's'} · ${esc(formatNpr(total))} before discount and VAT</p>` +
      (fresh.length
        ? `<p><strong>${fresh.length} stock number${fresh.length === 1 ? ' is' : 's are'} not in your inventory yet</strong> (marked NEW). They will be added as new products with the unit price above as their purchase price; set the selling price later in Update MRP.</p>` +
          `<label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" id="poi-confirm-new" /> <span>Yes, add ${fresh.length === 1 ? 'this' : 'these'} ${fresh.length} new product${fresh.length === 1 ? '' : 's'} to my inventory and create the purchase.</span></label>`
        : '');
    const box = document.getElementById('poi-confirm-new') as HTMLInputElement | null;
    if (box) {
      box.addEventListener('change', () => ($<HTMLButtonElement>('poi-save')!.disabled = !box.checked));
      return;
    }
    $<HTMLButtonElement>('poi-save')!.disabled = false;
  } catch (error) {
    poError(describe(error));
  }
}

$('pu-import')?.addEventListener('click', openPoImport);
$('qa-import')?.addEventListener('click', openPoImport);
$('poi-check')?.addEventListener('click', () => void checkPoFile());
$('poi-template')?.addEventListener('click', () => {
  apiDownload('/purchases/import-template/', 'purchase-import-template.xlsx').catch((e) => poError(describe(e)));
});
$('poi-file')?.addEventListener('change', () => {
  poLines = [];
  $('poi-preview')!.innerHTML = '';
  $<HTMLButtonElement>('poi-save')!.disabled = true;
});
$('form-po-import')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const supplierId = Number($<HTMLSelectElement>('poi-supplier')!.value);
  if (!supplierId) return poError('Choose a supplier.');
  if (!poLines.length) return poError('Check the file first.');
  $<HTMLButtonElement>('poi-save')!.disabled = true;
  try {
    // Confirmed new stock is added to the inventory first.
    for (const l of poLines) {
      if (l.isNew) {
        l.productId = await createProductReturningId({ stockNo: l.stockNo, name: l.name, purchasePrice: l.unitPrice });
        l.isNew = false;
      }
    }
    const made = await createPurchase({
      supplierId,
      billNo: $<HTMLInputElement>('poi-bill')!.value,
      purchaseDate: $<HTMLInputElement>('poi-date')!.value || undefined,
      discount: Number($<HTMLInputElement>('poi-discount')!.value) || 0,
      vatRate: Number($<HTMLInputElement>('poi-vat')!.value) || 0,
      freight: Number($<HTMLInputElement>('poi-freight')!.value) || 0,
      lines: poLines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })),
    });
    $<HTMLDialogElement>('dlg-po-import').close();
    await refreshAfterChange(made.id);
  } catch (error) {
    poError(describe(error));
    $<HTMLButtonElement>('poi-save')!.disabled = false;
  }
});

// The menu opens a tab through the address (#returns), like the Sales page.
function panelFromHash(): void {
  const name = window.location.hash.slice(1);
  if (name && document.querySelector(`.pu-panel[data-panel="${name}"]`)) showPanel(name);
  else if (!name && activeTab !== 'overview') showPanel('overview');
}
window.addEventListener('hashchange', panelFromHash);
panelFromHash();

void init();
