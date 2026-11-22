import { getSession } from '../../lib/auth';
import { ApiError } from '../../lib/api';
import { listStock, type StockItem } from '../../lib/inventory';
import {
  listOrders,
  getOrder,
  createOrder,
  cancelOrder,
  dispatchOrder,
  receiveOrder,
  returnDamaged,
  receiveReturn,
  reviewReturn,
  formatQty,
  STATUS_LABEL,
  DECISION_LABEL,
  type Order,
  type OrderSummary,
  type OrderReturn,
} from '../../lib/orders';

const _s = getSession();
if (!_s) window.location.replace('/');
// Independent businesses order from suppliers, not from a Head Office.
else if (_s.businessType === 'independent') window.location.replace('/supplier-orders');

let orders: OrderSummary[] = [];
let selected: Order | null = null;
let stock: StockItem[] = [];
let isBranch = false;
let isHeadOffice = false;
let canWrite = true;
let detailTab: 'overview' | 'items' | 'activity' = 'overview';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const val = (id: string) => $<HTMLInputElement>(id)?.value ?? '';

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const when = (iso: string) => {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

function flatten(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(flatten).filter(Boolean).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(flatten).filter(Boolean).join(' ');
  return '';
}

function describe(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  const entries = Object.entries(error.fields);
  if (entries.length > 0 && error.status === 400) return entries.map(([, v]) => flatten(v)).join(' ');
  return error.message;
}

function showError(id: string, message: string | null): void {
  const el = $(id);
  if (!el) return;
  el.hidden = !message;
  el.textContent = message ?? '';
}

function notice(message: string | null, error = false): void {
  const el = $('or-notice')!;
  el.hidden = !message;
  el.textContent = message ?? '';
  el.classList.toggle('is-error', error);
}

const dlg = (id: string) => $<HTMLDialogElement>(id)!;
document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((b) =>
  b.addEventListener('click', () => dlg(b.dataset.close!).close()),
);

async function submit(btnId: string, errId: string, dialogId: string, work: () => Promise<void>): Promise<void> {
  const btn = $<HTMLButtonElement>(btnId)!;
  btn.disabled = true;
  showError(errId, null);
  try {
    await work();
    dlg(dialogId).close();
  } catch (error) {
    showError(errId, describe(error));
  } finally {
    btn.disabled = false;
  }
}

const badge = (status: string) =>
  `<span class="or-badge or-badge-${status}">${esc(STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? status)}</span>`;

// ---- List ----------------------------------------------------------

function renderKpis(): void {
  $('kpi-total')!.textContent = String(orders.length);
  const open = orders.filter((o) => !['received', 'cancelled'].includes(o.status));
  const transit = orders.filter((o) => ['dispatched', 'partially_dispatched', 'partially_received'].includes(o.status));
  const waiting = orders.filter((o) => ['ordered', 'partially_dispatched'].includes(o.status));
  $('kpi-a-label')!.textContent = isHeadOffice ? 'Waiting to dispatch' : 'Open';
  $('kpi-a')!.textContent = String(isHeadOffice ? waiting.length : open.length);
  $('kpi-b')!.textContent = String(transit.length);
  $('kpi-dmg')!.textContent = formatQty(orders.reduce((s, o) => s + o.damagedToReturn, 0));
}

const PAGE_SIZE = 8;
let page = 1;

function inRange(o: OrderSummary): boolean {
  const days = Number(val('f-range')) || 0;
  if (!days) return true;
  return Date.now() - new Date(o.createdAt).getTime() <= days * 86_400_000;
}

const initials = (name: string) => {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};

const EYE = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';

function renderPager(totalPages: number): void {
  const el = $('or-pages');
  if (!el) return;
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  const nums: Array<number | '…'> = [];
  for (let n = 1; n <= totalPages; n++) {
    if (n === 1 || n === totalPages || Math.abs(n - page) <= 1) nums.push(n);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  el.innerHTML =
    `<button type="button" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>` +
    nums.map((n) => (n === '…' ? '<span>…</span>' : `<button type="button" data-page="${n}" class="${n === page ? 'is-active' : ''}">${n}</button>`)).join('') +
    `<button type="button" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''} aria-label="Next page">›</button>`;
}

function renderList(): void {
  const tbody = $('or-tbody')!;
  $('th-who')!.textContent = isHeadOffice ? 'Branch' : 'Head Office';
  const all = orders.filter(inRange);
  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  if (page > totalPages) page = totalPages;
  const rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (all.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="or-empty">${
      orders.length ? 'No orders in this period.' : isBranch ? 'No orders yet. Place one with “New Order”.' : isHeadOffice ? 'No orders from your branches.' : 'No orders.'
    }</td></tr>`;
  } else {
    tbody.innerHTML = rows
      .map((o) => {
        const who = isHeadOffice ? o.branchName : o.headOfficeName;
        return `<tr class="or-row ${selected?.id === o.id ? 'is-selected' : ''}" data-id="${o.id}">
          <td class="mono">${esc(o.reference)}</td>
          <td><span class="or-who"><span class="or-ava">${esc(initials(who))}</span>${esc(who)}</span></td>
          <td>${esc(o.createdAt.slice(0, 10))}</td>
          <td>${badge(o.status)}</td>
          <td class="num">${formatQty(o.ordered)}</td>
          <td class="num">${formatQty(o.dispatched)}</td>
          <td class="num">${formatQty(o.receivedGood)}</td>
          <td class="num ${o.receivedDamaged > 0 ? 'warn' : ''}">${formatQty(o.receivedDamaged)}</td>
          <td class="or-act"><button type="button" class="or-eye" aria-label="View ${esc(o.reference)}" title="View">${EYE}</button></td>
        </tr>`;
      })
      .join('');
  }
  const from = (page - 1) * PAGE_SIZE + 1;
  $('or-count')!.textContent = all.length
    ? `Showing ${from}–${from + rows.length - 1} of ${all.length} order${all.length === 1 ? '' : 's'}`
    : '';
  renderPager(totalPages);
  tbody.querySelectorAll<HTMLTableRowElement>('.or-row').forEach((row) =>
    row.addEventListener('click', () => void openDetail(Number(row.dataset.id))),
  );
}

async function loadList(): Promise<void> {
  try {
    orders = await listOrders(val('f-status') as never, val('f-search').trim());
    notice(
      !canWrite
        ? 'Read-only: you are viewing this business from the company owner account.'
        : !isBranch && !isHeadOffice
          ? 'Orders are between a Branch and its Head Office. This business has none.'
          : null,
    );
  } catch (error) {
    orders = [];
    notice(describe(error), true);
  }
  renderKpis();
  renderList();
}

// ---- Detail --------------------------------------------------------

async function openDetail(id: number): Promise<void> {
  try {
    selected = await getOrder(id);
  } catch (error) {
    notice(describe(error), true);
    return;
  }
  detailTab = 'overview';
  renderList();
  renderDetail();
}

async function refresh(id?: number): Promise<void> {
  await loadList();
  if (id) {
    try { selected = await getOrder(id); } catch { selected = null; }
    renderList();
    renderDetail();
  }
}

function returnBlock(r: OrderReturn): string {
  const actions: string[] = [];
  if (canWrite && isHeadOffice && !r.receipt) actions.push(`<button class="btn-ghost-sm" data-recv-ret="${r.id}">Receive returned goods</button>`);
  if (canWrite && isHeadOffice && r.receipt && !r.review) actions.push(`<button class="btn-primary-sm" data-review="${r.id}">Review</button>`);
  return `<li>
    <p><strong>Returned to Head Office</strong> <span class="muted">${esc(when(r.at))} · ${esc(r.by)}</span></p>
    <p>${r.items.map((i) => `${esc(i.productName)} ×${formatQty(i.quantity)}`).join(', ')}</p>
    <p class="muted">Note: ${esc(r.notes)}</p>
    ${r.receipt ? `<p class="small">Received by Head Office ${esc(when(r.receipt.at))}.</p>` : `<p class="small warn">Waiting for Head Office to receive.</p>`}
    ${r.review
      ? `<p class="small"><strong>${esc(DECISION_LABEL[r.review.decision])}</strong>: ${esc(r.review.remarks)}
          <span class="muted">(${r.review.items.map((i) => `${esc(i.productName)} ${formatQty(i.acceptedQuantity)} ok / ${formatQty(i.rejectedQuantity)} rejected`).join(', ')})</span></p>`
      : r.receipt ? `<p class="small warn">Waiting for review.</p>` : ''}
    <div class="or-detail-actions">${actions.join('')}</div>
  </li>`;
}

function renderDetail(): void {
  const el = $('or-detail')!;
  const o = selected;
  if (!o) {
    el.innerHTML = `<p class="or-empty-detail">Select an order to see its items and history.</p>`;
    return;
  }
  const canDispatch = o.items.some((i) => i.toDispatch > 0) && ['ordered', 'partially_dispatched', 'partially_received'].includes(o.status);
  const canReceive = o.items.some((i) => i.toReceive > 0);
  const canReturn = o.items.some((i) => i.damagedToReturn > 0);
  const acts: string[] = [];
  if (canWrite && isHeadOffice && canDispatch) acts.push(`<button class="btn-primary-sm" data-act="dispatch">Dispatch stock</button>`);
  if (canWrite && isBranch && canReceive) acts.push(`<button class="btn-primary-sm" data-act="receive">Receive goods</button>`);
  if (canWrite && isBranch && canReturn) acts.push(`<button class="btn-ghost-sm" data-act="return">Return damaged</button>`);
  if (canWrite && o.status === 'ordered') acts.push(`<button class="btn-ghost-sm is-danger" data-act="cancel">${isHeadOffice ? 'Reject order' : 'Cancel order'}</button>`);

  const who = isHeadOffice ? o.branchName : o.headOfficeName;
  const itemsTable = `<div class="or-table-wrap">
    <table class="or-table or-mini">
      <thead><tr><th>Item</th><th class="num">Ordered</th><th class="num">Sent</th><th class="num">Good</th><th class="num">Damaged</th><th class="num">On the way</th></tr></thead>
      <tbody>${o.items.map((i) => `<tr>
        <td>${esc(i.productName)}<br /><span class="muted mono">${esc(i.stockNo)}</span></td>
        <td class="num">${formatQty(i.ordered)}</td>
        <td class="num">${formatQty(i.dispatched)}</td>
        <td class="num">${formatQty(i.receivedGood)}</td>
        <td class="num ${i.receivedDamaged > 0 ? 'warn' : ''}">${formatQty(i.receivedDamaged)}${i.returned > 0 ? `<br /><span class="muted">${formatQty(i.returned)} sent back</span>` : ''}</td>
        <td class="num">${formatQty(i.toReceive)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  const history = o.dispatches.length + o.receipts.length + o.returns.length === 0 ? `<p class="muted small">Nothing has moved yet.</p>` : `
    <ul class="or-history">
      ${o.dispatches.map((d) => `<li><p><strong>Dispatched by Head Office</strong> <span class="muted">${esc(when(d.at))} · ${esc(d.by)}</span></p>
        <p>${d.items.map((i) => `${esc(i.productName)} ×${formatQty(i.quantity)}`).join(', ')}</p>${d.notes ? `<p class="muted">${esc(d.notes)}</p>` : ''}</li>`).join('')}
      ${o.receipts.map((r) => `<li><p><strong>Received by branch</strong> <span class="muted">${esc(when(r.at))} · ${esc(r.by)}</span></p>
        <p>${r.items.map((i) => `${esc(i.productName)}: ${formatQty(i.goodQuantity)} good${i.damagedQuantity > 0 ? `, <span class="warn">${formatQty(i.damagedQuantity)} damaged</span>` : ''}`).join('; ')}</p>${r.notes ? `<p class="muted">${esc(r.notes)}</p>` : ''}</li>`).join('')}
      ${o.returns.map((r) => returnBlock(r)).join('')}
    </ul>`;
  const sum = (f: (i: Order['items'][number]) => number) => formatQty(o.items.reduce((t, i) => t + f(i), 0));
  const overview = `
    <h4>${isHeadOffice ? 'Branch' : 'Head Office'}</h4>
    <div class="or-who or-who-lg"><span class="or-ava">${esc(initials(who))}</span><div><strong>${esc(who)}</strong><span class="muted small">Ordered by ${esc(o.createdByName || '—')}</span></div></div>
    ${o.notes ? `<p class="small notes">${esc(o.notes)}</p>` : ''}
    <h4>Order Summary</h4>
    <dl class="or-sum">
      <div><dt>Products</dt><dd>${o.items.length}</dd></div>
      <div><dt>Ordered</dt><dd>${sum((i) => i.ordered)}</dd></div>
      <div><dt>Dispatched</dt><dd>${sum((i) => i.dispatched)}</dd></div>
      <div><dt>Received (good)</dt><dd>${sum((i) => i.receivedGood)}</dd></div>
      <div class="${o.receivedDamaged > 0 ? 'warn' : ''}"><dt>Received (damaged)</dt><dd>${formatQty(o.receivedDamaged)}</dd></div>
      <div class="or-sum-total"><dt>Still on the way</dt><dd>${sum((i) => i.toReceive)}</dd></div>
    </dl>
    ${acts.length ? `<h4>Quick Actions</h4><div class="or-detail-actions">${acts.join('')}</div>` : ''}`;
  const body = detailTab === 'items' ? itemsTable : detailTab === 'activity' ? history : overview;

  el.innerHTML = `
    <div class="or-dhead">
      <h3>Order Details</h3>
      <button type="button" class="or-x" id="or-close" aria-label="Close details">×</button>
    </div>
    <div class="or-dtop">
      <span class="or-dicon">${'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/></svg>'}</span>
      <div><p class="mono or-dref">${esc(o.reference)} ${badge(o.status)}</p><p class="muted small">${esc(when(o.createdAt))}</p></div>
    </div>
    <div class="or-tabs" role="tablist">
      ${(['overview', 'items', 'activity'] as const).map((t) => `<button type="button" role="tab" data-dtab="${t}" class="${t === detailTab ? 'is-active' : ''}" aria-selected="${t === detailTab}">${t === 'overview' ? 'Overview' : t === 'items' ? 'Items' : 'Activity'}</button>`).join('')}
    </div>
    <div class="or-dbody">${body}</div>
  `;
  el.querySelectorAll<HTMLButtonElement>('[data-dtab]').forEach((b) =>
    b.addEventListener('click', () => { detailTab = b.dataset.dtab as typeof detailTab; renderDetail(); }),
  );
  $('or-close')?.addEventListener('click', () => { selected = null; renderList(); renderDetail(); });

  el.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) =>
    b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'dispatch') openDispatch(o);
      else if (act === 'receive') openReceive(o);
      else if (act === 'return') openReturn(o);
      else if (act === 'cancel') openCancel(o);
    }),
  );
  el.querySelectorAll<HTMLButtonElement>('[data-recv-ret]').forEach((b) =>
    b.addEventListener('click', () => openReceiveReturn(o, Number(b.dataset.recvRet))),
  );
  el.querySelectorAll<HTMLButtonElement>('[data-review]').forEach((b) =>
    b.addEventListener('click', () => openReview(o, Number(b.dataset.review))),
  );
}

// ---- Generic quantities dialog -------------------------------------

interface QtyRow {
  key: number;
  label: string;
  hint?: string;
  fields: { name: string; label: string; value: number; max?: number }[];
}

let qtyHandler: ((values: Map<number, Record<string, number>>, note: string) => Promise<void>) | null = null;

function openQty(opts: {
  title: string;
  sub: string;
  rows: QtyRow[];
  noteLabel: string;
  noteRequired?: boolean;
  submitLabel: string;
  onSubmit: (values: Map<number, Record<string, number>>, note: string) => Promise<void>;
}): void {
  $('q-title')!.textContent = opts.title;
  $('q-sub')!.textContent = opts.sub;
  $('q-note-label')!.textContent = opts.noteLabel + (opts.noteRequired ? ' *' : '');
  $<HTMLInputElement>('q-note')!.required = Boolean(opts.noteRequired);
  $<HTMLInputElement>('q-note')!.value = '';
  $('q-save')!.textContent = opts.submitLabel;
  $('q-rows')!.innerHTML = opts.rows
    .map(
      (r) => `<div class="or-qrow" data-key="${r.key}">
        <span>${esc(r.label)}${r.hint ? ` <span class="muted">${esc(r.hint)}</span>` : ''}</span>
        ${r.fields.map((f) => `<label>${esc(f.label)}<input type="number" data-name="${f.name}" min="0" ${f.max !== undefined ? `max="${f.max}"` : ''} step="0.001" value="${f.value}" /></label>`).join('')}
      </div>`,
    )
    .join('');
  showError('q-error', null);
  qtyHandler = opts.onSubmit;
  dlg('dlg-qty').showModal();
}

$('form-qty')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!qtyHandler) return;
  const values = new Map<number, Record<string, number>>();
  document.querySelectorAll<HTMLElement>('#q-rows .or-qrow').forEach((row) => {
    const rec: Record<string, number> = {};
    row.querySelectorAll<HTMLInputElement>('input').forEach((i) => (rec[i.dataset.name!] = Number(i.value) || 0));
    values.set(Number(row.dataset.key), rec);
  });
  const handler = qtyHandler;
  void submit('q-save', 'q-error', 'dlg-qty', () => handler(values, val('q-note').trim()));
});

function openDispatch(o: Order): void {
  const available = new Map(stock.map((s) => [s.productId, s.quantity]));
  openQty({
    title: 'Dispatch stock',
    sub: `${o.reference} to ${o.branchName}. Check the order, then send what you have. Only good stock is dispatched; you can send the rest later.`,
    rows: o.items.filter((i) => i.toDispatch > 0).map((i) => {
      const have = available.get(i.productId) ?? 0;
      return {
        key: i.id,
        label: i.productName,
        hint: `ordered ${formatQty(i.toDispatch)} more · you have ${formatQty(have)}`,
        fields: [{ name: 'q', label: 'Send', value: Math.min(i.toDispatch, Math.max(have, 0)), max: i.toDispatch }],
      };
    }),
    noteLabel: 'Note (optional)',
    submitLabel: 'Dispatch',
    onSubmit: async (values, note) => {
      const lines = [...values].map(([itemId, v]) => ({ itemId, quantity: v.q })).filter((l) => l.quantity > 0);
      if (lines.length === 0) throw new ApiError('Enter a quantity to send.', 400);
      await dispatchOrder(o.id, lines, note);
      await refresh(o.id);
    },
  });
}

function openReceive(o: Order): void {
  openQty({
    title: 'Check and receive goods',
    sub: `${o.reference}. Count what arrived: good stock is added to your stock, damaged stock is kept apart.`,
    rows: o.items.filter((i) => i.toReceive > 0).map((i) => ({
      key: i.id,
      label: i.productName,
      hint: `on the way ${formatQty(i.toReceive)}`,
      fields: [
        { name: 'good', label: 'Good', value: i.toReceive, max: i.toReceive },
        { name: 'damaged', label: 'Damaged', value: 0, max: i.toReceive },
      ],
    })),
    noteLabel: 'Note (optional)',
    submitLabel: 'Add to stock',
    onSubmit: async (values, note) => {
      const lines = [...values]
        .map(([itemId, v]) => ({ itemId, good: v.good, damaged: v.damaged }))
        .filter((l) => l.good > 0 || l.damaged > 0);
      if (lines.length === 0) throw new ApiError('Enter what arrived.', 400);
      await receiveOrder(o.id, lines, note);
      await refresh(o.id);
    },
  });
}

function openReturn(o: Order): void {
  openQty({
    title: 'Return damaged stock to Head Office',
    sub: `${o.reference}. Damaged stock leaves your damaged stock now; Head Office checks it when it arrives. Say why.`,
    rows: o.items.filter((i) => i.damagedToReturn > 0).map((i) => ({
      key: i.id,
      label: i.productName,
      hint: `damaged ${formatQty(i.damagedToReturn)}`,
      fields: [{ name: 'q', label: 'Return', value: i.damagedToReturn, max: i.damagedToReturn }],
    })),
    noteLabel: 'Reason for return',
    noteRequired: true,
    submitLabel: 'Return to Head Office',
    onSubmit: async (values, note) => {
      const lines = [...values].map(([itemId, v]) => ({ itemId, quantity: v.q })).filter((l) => l.quantity > 0);
      if (lines.length === 0) throw new ApiError('Enter a quantity to return.', 400);
      await returnDamaged(o.id, lines, note);
      await refresh(o.id);
    },
  });
}

function openReceiveReturn(o: Order, batchId: number): void {
  const batch = o.returns.find((r) => r.id === batchId);
  if (!batch) return;
  openQty({
    title: 'Receive returned goods',
    sub: `${batch.reference}. Branch note: “${batch.notes}”. Head Office must receive the whole returned quantity.`,
    rows: batch.items.map((i) => ({
      key: i.id,
      label: i.productName,
      hint: `returned ${formatQty(i.quantity)}`,
      fields: [{ name: 'q', label: 'Received', value: i.quantity, max: i.quantity }],
    })),
    noteLabel: 'Note (optional)',
    submitLabel: 'Confirm received',
    onSubmit: async (values, note) => {
      await receiveReturn(o.id, batchId, [...values].map(([returnItemId, v]) => ({ returnItemId, quantity: v.q })), note);
      await refresh(o.id);
    },
  });
}

function openReview(o: Order, batchId: number): void {
  const batch = o.returns.find((r) => r.id === batchId);
  if (!batch?.receipt) return;
  openQty({
    title: 'Review returned goods',
    sub: `${batch.reference}. For each item, how many are accepted and how many are rejected? They must add up to what you received.`,
    rows: batch.receipt.items.map((i) => ({
      key: i.id,
      label: i.productName,
      hint: `received ${formatQty(i.receivedQuantity)}`,
      fields: [
        { name: 'accepted', label: 'Accepted', value: i.receivedQuantity, max: i.receivedQuantity },
        { name: 'rejected', label: 'Rejected', value: 0, max: i.receivedQuantity },
      ],
    })),
    noteLabel: 'Remarks',
    noteRequired: true,
    submitLabel: 'Save review',
    onSubmit: async (values, note) => {
      await reviewReturn(
        o.id,
        batchId,
        [...values].map(([receiptItemId, v]) => ({ receiptItemId, accepted: v.accepted, rejected: v.rejected })),
        note,
      );
      await refresh(o.id);
    },
  });
}

// ---- Cancel --------------------------------------------------------

function openCancel(o: Order): void {
  $('c-sub')!.textContent = `${o.reference}. Only an order that has not been dispatched can be cancelled.`;
  $<HTMLInputElement>('c-reason')!.value = '';
  showError('c-error', null);
  $('form-cancel')!.dataset.id = String(o.id);
  dlg('dlg-cancel').showModal();
}

$('form-cancel')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = Number($('form-cancel')!.dataset.id);
  void submit('c-save', 'c-error', 'dlg-cancel', async () => {
    await cancelOrder(id, val('c-reason').trim());
    await refresh(id);
  });
});

// ---- New order -----------------------------------------------------

const productOptions = () =>
  `<option value="">Choose product…</option>` +
  stock.map((s) => `<option value="${s.productId}">${esc(s.stockNo)} · ${esc(s.name)}</option>`).join('');

function addNewLine(): void {
  const row = document.createElement('div');
  row.className = 'or-line';
  row.innerHTML = `
    <select class="ln-product" aria-label="Product">${productOptions()}</select>
    <input class="ln-qty" type="number" min="0.001" step="0.001" value="1" aria-label="Quantity" />
    <button type="button" class="btn-link is-danger ln-remove" aria-label="Remove">✕</button>`;
  $('new-lines')!.appendChild(row);
  row.querySelector('.ln-remove')!.addEventListener('click', () => row.remove());
}

$('or-new')?.addEventListener('click', () => {
  $('new-lines')!.innerHTML = '';
  addNewLine();
  $<HTMLInputElement>('new-notes')!.value = '';
  showError('new-error', null);
  dlg('dlg-new').showModal();
});
$('new-add')?.addEventListener('click', addNewLine);

$('form-new')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const lines = Array.from(document.querySelectorAll<HTMLElement>('#new-lines .or-line'))
    .map((r) => ({
      productId: Number(r.querySelector<HTMLSelectElement>('.ln-product')!.value),
      quantity: Number(r.querySelector<HTMLInputElement>('.ln-qty')!.value),
    }))
    .filter((l) => l.productId);
  if (lines.length === 0) {
    showError('new-error', 'Add at least one item.');
    return;
  }
  if (new Set(lines.map((l) => l.productId)).size !== lines.length) {
    showError('new-error', 'A product can appear only once in an order.');
    return;
  }
  void submit('new-save', 'new-error', 'dlg-new', async () => {
    const created = await createOrder(lines, val('new-notes'));
    await refresh(created.id);
  });
});

// ---- Filters, load -------------------------------------------------

let timer: number | undefined;
$('f-search')?.addEventListener('input', () => {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => { page = 1; void loadList(); }, 300);
});
$('f-status')?.addEventListener('change', () => { page = 1; void loadList(); });
$('f-range')?.addEventListener('change', () => { page = 1; renderList(); });
$('or-pages')?.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-page]');
  if (!b || b.disabled) return;
  page = Number(b.dataset.page) || 1;
  renderList();
});
$('or-refresh')?.addEventListener('click', () => void init());
document.getElementById('branch-select')?.addEventListener('change', () => setTimeout(() => void init(), 300));

async function init(): Promise<void> {
  const s = getSession();
  if (s) $('or-scope')!.textContent = `${s.activeBranchName} (${s.activeBranchCode})`;
  isBranch = s?.businessType === 'branch';
  isHeadOffice = s?.businessType === 'head_office';
  canWrite = s?.accessMode !== 'read_only';
  $('or-heading')!.textContent = isHeadOffice ? 'Orders from Branches' : 'Orders';
  $('or-new')!.hidden = !(isBranch && canWrite);
  selected = null;
  renderDetail();
  // The list is what the person came for. Stock is only needed once "New order" is
  // opened, so it loads beside the list instead of before it.
  const stockLoad = listStock().then((x) => { stock = x; }).catch(() => { stock = []; });
  await loadList();
  await stockLoad;
}

void init();
