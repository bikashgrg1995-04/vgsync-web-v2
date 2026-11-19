import { statementUrl } from '../../lib/statements';
import { getSession, refreshProfile } from '../../lib/auth';
import { ApiError } from '../../lib/api';
import { listSales, type Sale } from '../../lib/sales';
import {
  listCustomers,
  createCustomer,
  updateCustomer,
  setCustomerActive,
  getCustomerSummary,
  getStatement,
  downloadStatement,
  formatNpr,
  TYPE_LABEL,
  STATEMENT_TYPES,
  type Customer,
  type CustomerInput,
  type CustomerType,
  type StatementFilters,
  type StatementRow,
  type StatementType,
} from '../../lib/customers';

if (!getSession()) window.location.replace('/');

let customers: Customer[] = [];
let selectedId: number | null = null;
let canWrite = true;
let firstLoadDone = false;

let stmtPage = 1;
let stmtRows: StatementRow[] = [];
let stmtToken = 0;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const input = (id: string) => $<HTMLInputElement>(id)!;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  customer_type: 'Type',
  phone: 'Phone',
  email: 'Email',
  address: 'Address',
  pan_number: 'PAN',
  notes: 'Notes',
  credit_limit: 'Credit limit',
  is_active: 'Status',
  date_from: 'From',
  date_to: 'To',
};

function describe(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  const entries = Object.entries(error.fields);
  if (entries.length > 0 && error.status === 400) {
    return entries.map(([key, msg]) => `${FIELD_LABELS[key] ?? key}: ${msg}`).join(' ');
  }
  return error.message;
}

function setText(id: string, value: string): void {
  const el = $(id);
  if (el) el.textContent = value || '—';
}

function showBox(id: string, message: string | null): void {
  const el = $(id);
  if (!el) return;
  el.hidden = !message;
  el.textContent = message ?? '';
}

function selected(): Customer | null {
  return customers.find((c) => c.id === selectedId) ?? null;
}

function filtered(): Customer[] {
  const q = (input('cus-search').value ?? '').trim().toLowerCase();
  const type = $<HTMLSelectElement>('cus-type-filter')?.value ?? '';
  const st = $<HTMLSelectElement>('cus-status-filter')?.value ?? '';
  const dues = input('cus-dues-filter').checked;

  return customers.filter((c) => {
    if (type && c.type !== type) return false;
    if (st === 'active' && !c.isActive) return false;
    if (st === 'inactive' && c.isActive) return false;
    if (dues && c.creditToReceive <= 0) return false;
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.pan.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  });
}

const PAGE_SIZE = 10;
let page = 1;
const salesCache = new Map<number, Sale[]>();
let salesToken = 0;

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
const code = (c: Customer) => `CUST-${String(c.id).padStart(3, '0')}`;
const dateText = (iso: string) => new Date(iso.length === 10 ? iso + 'T00:00' : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const AVATAR_TONES = ['#4f46e5', '#0ea5e9', '#16a34a', '#f59e0b', '#db2777', '#7c3aed'];
const avatar = (c: Customer, big = false) => `<span class="cus-avatar${big ? ' big' : ''}" style="background:${AVATAR_TONES[c.id % AVATAR_TONES.length]}">${esc(initials(c.name))}</span>`;
const statusChip = (paid: string) => `<span class="cus-chip ${paid === 'paid' ? 'ok' : paid === 'partial' ? 'warn' : 'pend'}">${paid === 'paid' ? '✓ Paid' : paid === 'partial' ? 'Part paid' : 'Pending'}</span>`;

function renderKpis(): void {
  const s = getCustomerSummary(customers);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const newThisMonth = customers.filter((c) => new Date(c.createdAt).getTime() >= monthStart);
  const inactive = customers.filter((c) => !c.isActive);
  setText('kpi-total', String(s.total));
  setText('kpi-active', String(s.active));
  setText('kpi-inactive', String(inactive.length));
  setText('kpi-dues', String(s.withDues));
  const sub = (id: string, text: string, tone = '') => {
    const el = $(id);
    if (el) { el.textContent = text; el.className = `pd-kpi-sub ${tone}`; }
  };
  sub('kpi-total-sub', `↑ +${newThisMonth.length} this month`, newThisMonth.length ? 'is-up' : '');
  sub('kpi-active-sub', `↑ +${newThisMonth.filter((c) => c.isActive).length} this month`, 'is-up');
  sub('kpi-inactive-sub', inactive.length ? 'Not offered on new sales' : 'None', '');
  sub('kpi-dues-sub', `${formatNpr(s.receivable)} owed to you`, '');
}

function renderTable(resetPage = false): void {
  const tbody = $('cus-tbody');
  const count = $('cus-count');
  if (!tbody) return;
  if (resetPage) page = 1;
  const rows = filtered();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (page > pages) page = pages;
  setText('cus-count-chip', `${customers.length} customer${customers.length === 1 ? '' : 's'}`);

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="cus-empty">No customers found.</td></tr>`;
    if (count) count.textContent = 'Showing 0 customers';
    $('cus-pages')!.innerHTML = '';
    return;
  }
  const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  tbody.innerHTML = slice
    .map((c) => {
      const active = c.id === selectedId ? ' is-selected' : '';
      const over = c.overCreditLimit ? ' <span class="cus-over" title="Over credit limit">over limit</span>' : '';
      return `<tr class="cus-row${active}" data-id="${c.id}">
        <td><div class="cus-person">${avatar(c)}<div><strong>${esc(c.name)}</strong><em>${code(c)}</em></div></div></td>
        <td><span class="cus-type cus-type-${c.type}">${esc(TYPE_LABEL[c.type] ?? c.type)}</span></td>
        <td class="cus-contact">${c.phone ? `<span>☎ ${esc(c.phone)}</span>` : ''}${c.email ? `<span>✉ ${esc(c.email)}</span>` : ''}${!c.phone && !c.email ? '—' : ''}</td>
        <td class="num">${formatNpr(c.creditToReceive)}${over}</td>
        <td><span class="cus-badge cus-badge-${c.isActive ? 'active' : 'inactive'}"><i></i>${c.isActive ? 'Active' : 'Inactive'}</span></td>
        <td class="cus-actions"><button type="button" class="cus-icon-btn" data-view="${c.id}" aria-label="View ${esc(c.name)}" title="View">👁</button><button type="button" class="cus-icon-btn" data-menu="${c.id}" aria-label="More actions" title="More">⋮</button></td>
      </tr>`;
    })
    .join('');
  const from = (page - 1) * PAGE_SIZE + 1;
  if (count) count.textContent = `Showing ${from}–${from + slice.length - 1} of ${rows.length} customers`;

  const nums: Array<number | '…'> = [];
  for (let i = 1; i <= pages; i += 1) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  $('cus-pages')!.innerHTML = pages === 1 ? '' :
    `<button type="button" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''} aria-label="Previous">‹</button>` +
    nums.map((n) => (n === '…' ? '<span>…</span>' : `<button type="button" data-page="${n}" class="${n === page ? 'is-active' : ''}">${n}</button>`)).join('') +
    `<button type="button" data-page="${page + 1}" ${page === pages ? 'disabled' : ''} aria-label="Next">›</button>`;

  $('cus-pages')!.querySelectorAll<HTMLButtonElement>('[data-page]').forEach((btn) =>
    btn.addEventListener('click', () => { page = Number(btn.dataset.page) || 1; renderTable(); }),
  );
  tbody.querySelectorAll<HTMLTableRowElement>('.cus-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-menu]')) return;
      select(Number(row.dataset.id) || null);
    });
  });
  tbody.querySelectorAll<HTMLButtonElement>('[data-menu]').forEach((btn) =>
    btn.addEventListener('click', (e) => { e.stopPropagation(); rowMenu(Number(btn.dataset.menu), btn); }),
  );
}

function select(id: number | null): void {
  selectedId = id;
  renderTable();
  renderDetail();
  void loadStatement(true);
  void loadSales();
}

/** A small menu on the row: view, edit, activate or deactivate. */
function rowMenu(id: number, anchor: HTMLElement): void {
  document.getElementById('cus-menu')?.remove();
  const c = customers.find((x) => x.id === id);
  if (!c) return;
  const menu = document.createElement('div');
  menu.id = 'cus-menu';
  menu.className = 'cus-menu';
  menu.innerHTML = `<button data-do="view">View details</button>` + (canWrite ? `<button data-do="edit">Edit</button><button data-do="toggle">${c.isActive ? 'Deactivate' : 'Reactivate'}</button>` : '') + `<button data-do="statement">Statement</button>`;
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = `${r.bottom + window.scrollY + 4}px`;
  menu.style.left = `${Math.max(8, r.right + window.scrollX - 160)}px`;
  menu.addEventListener('click', (e) => {
    const what = (e.target as HTMLElement).dataset.do;
    menu.remove();
    select(id);
    if (what === 'edit') openForm(c);
    else if (what === 'toggle') $('cus-toggle')?.click();
    else if (what === 'statement') $('cus-statement')?.click();
  });
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
}

function setTab(next: string): void {

  document.querySelectorAll<HTMLButtonElement>('.cus-tabs [data-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === next));
  document.querySelectorAll<HTMLElement>('.cus-tabpanel').forEach((p) => { p.hidden = p.dataset.panel !== next; });
}

async function loadSales(): Promise<void> {
  const c = selected();
  if (!c) return;
  const token = ++salesToken;
  if (!salesCache.has(c.id)) {
    ['d-month', 'd-recent', 'd-history'].forEach((id) => { $(id)!.innerHTML = '<p class="cus-muted">Loading…</p>'; });
    try {
      salesCache.set(c.id, await listSales({ customerId: c.id, status: 'confirmed' }));
    } catch {
      if (token === salesToken) ['d-month', 'd-recent', 'd-history'].forEach((id) => { $(id)!.innerHTML = '<p class="cus-muted">Purchases are not available for you.</p>'; });
      return;
    }
  }
  if (token !== salesToken) return;
  renderSales(salesCache.get(c.id)!);
}

function renderSales(all: Sale[]): void {
  const sales = [...all].sort((a, b) => b.saleDate.localeCompare(a.saleDate) || b.id - a.id);
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const year = String(now.getFullYear());
  const thisYear = sales.filter((x) => x.saleDate.startsWith(year)).reduce((a, x) => a + x.netTotal, 0);
  setText('d-year', formatNpr(thisYear));
  setText('d-last', sales[0] ? formatNpr(sales[0].netTotal) : 'None yet');

  const line = (x: Sale) => `<li><span>${esc(dateText(x.saleDate))}</span><strong>${formatNpr(x.netTotal)}</strong>${statusChip(x.paymentStatus)}</li>`;
  const month = sales.filter((x) => x.saleDate.startsWith(ym));
  const monthTotal = month.reduce((a, x) => a + x.netTotal, 0);
  $('d-month')!.innerHTML = month.length
    ? `<div class="cus-month"><strong>${formatNpr(monthTotal)}</strong>${statusChip(month[0]!.paymentStatus)}</div><p class="cus-muted">Latest: ${esc(dateText(month[0]!.saleDate))} · ${esc(month[0]!.invoiceNo || month[0]!.saleNo)}${month.length > 1 ? ` · ${month.length} sales this month` : ''}</p>`
    : '<p class="cus-muted">No purchases this month.</p>';
  $('d-recent')!.innerHTML = sales.length ? `<ul class="cus-recent">${sales.slice(0, 3).map(line).join('')}</ul>` : '<p class="cus-muted">No purchases yet.</p>';
  $('d-history')!.innerHTML = sales.length
    ? `<table class="cus-hist"><thead><tr><th>Date</th><th>Invoice</th><th class="num">Total</th><th>Payment</th></tr></thead><tbody>${sales.map((x) => `<tr><td>${esc(dateText(x.saleDate))}</td><td><a href="/sales/detail?id=${x.id}">${esc(x.invoiceNo || x.saleNo)}</a></td><td class="num">${formatNpr(x.netTotal)}</td><td>${statusChip(x.paymentStatus)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="cus-muted">No purchases yet.</p>';
}

function renderDetail(): void {
  const empty = $('cus-detail-empty');
  const body = $('cus-detail-body');
  const c = selected();
  if (!c) {
    selectedId = null;
    empty?.removeAttribute('hidden');
    body?.setAttribute('hidden', '');
    return;
  }
  empty?.setAttribute('hidden', '');
  body?.removeAttribute('hidden');

  $('d-avatar')!.outerHTML = avatar(c, true).replace('<span ', '<span id="d-avatar" aria-hidden="true" ');
  setText('d-code', code(c));
  setText('d-name', c.name);
  setText('d-fullname', c.name);
  setText('d-type-line', `${TYPE_LABEL[c.type] ?? c.type} Customer`);
  setText('d-type', TYPE_LABEL[c.type] ?? c.type);
  setText('d-phone', c.phone);
  setText('d-email', c.email);
  setText('d-pan', c.pan);
  setText('d-address', c.address);
  setText('d-created', dateText(c.createdAt));
  setText('d-owes', formatNpr(c.creditToReceive));
  setText('d-credit', c.creditLimit > 0 ? formatNpr(c.creditLimit) : 'No limit');
  setText('d-credit-to-pay', formatNpr(c.creditToPay));
  setText('d-advance', formatNpr(c.advanceReceived));
  setText('d-total', formatNpr(c.totalSales));
  setText('d-year', '…');
  setText('d-last', '…');
  setText('d-stock', String(c.stockToGive));
  setText('d-notes', c.notes);
  setText('d-meta', `Updated ${new Date(c.updatedAt).toLocaleDateString()}`);

  const warn = $('d-limit-warn');
  if (warn) warn.hidden = !c.overCreditLimit;

  const st = $('d-status');
  if (st) {
    st.textContent = c.isActive ? 'Active' : 'Inactive';
    st.className = `cus-badge cus-badge-${c.isActive ? 'active' : 'inactive'}`;
  }
  const toggle = $('cus-toggle');
  if (toggle) toggle.textContent = c.isActive ? 'Deactivate' : 'Reactivate';
  if (salesCache.has(c.id)) renderSales(salesCache.get(c.id)!);
}

document.querySelectorAll<HTMLButtonElement>('.cus-tabs [data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab!)));
document.querySelectorAll<HTMLButtonElement>('[data-goto]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.goto!)));
$('cus-close')?.addEventListener('click', () => select(null));

// ---------- statement ----------

function stmtFilters(): StatementFilters {
  return {
    dateFrom: input('stmt-from').value,
    dateTo: input('stmt-to').value,
    type: ($<HTMLSelectElement>('stmt-type')?.value ?? '') as StatementType | '',
  };
}

function renderStatementRows(): void {
  const tbody = $('stmt-tbody');
  if (!tbody) return;
  if (stmtRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="cus-empty">No transactions.</td></tr>`;
    return;
  }
  tbody.innerHTML = stmtRows
    .map((r) => {
      const label = STATEMENT_TYPES[r.type as StatementType] ?? r.type;
      return `<tr>
        <td>${esc(r.date)}</td>
        <td>${esc(label)}</td>
        <td title="${esc(r.description)}">${esc(r.reference) || '—'}</td>
        <td class="num">${r.debit ? formatNpr(r.debit) : ''}</td>
        <td class="num">${r.credit ? formatNpr(r.credit) : ''}</td>
        <td class="num">${formatNpr(r.balance)}</td>
      </tr>`;
    })
    .join('');
}

async function loadStatement(reset: boolean): Promise<void> {
  const c = selected();
  const more = $<HTMLButtonElement>('stmt-more');
  if (!c) return;

  if (reset) {
    stmtPage = 1;
    stmtRows = [];
    renderStatementRows();
    setText('stmt-totals', '');
    if (more) more.hidden = true;
  }
  showBox('stmt-error', null);

  const token = ++stmtToken;
  try {
    const data = await getStatement(c.id, stmtFilters(), stmtPage);
    if (token !== stmtToken) return; // a newer request replaced this one

    stmtRows = stmtRows.concat(data.rows);
    renderStatementRows();
    const totals = $('stmt-totals');
    if (totals) {
      totals.textContent =
        `Opening ${formatNpr(data.openingBalance)} · Debit ${formatNpr(data.totalDebit)} · ` +
        `Credit ${formatNpr(data.totalCredit)} · Closing ${formatNpr(data.closingBalance)}`;
    }
    if (more) more.hidden = !data.hasMore;
  } catch (error) {
    if (token !== stmtToken) return;
    showBox('stmt-error', describe(error));
  }
}

$('stmt-more')?.addEventListener('click', () => {
  stmtPage += 1;
  void loadStatement(false);
});
for (const id of ['stmt-from', 'stmt-to', 'stmt-type']) {
  $(id)?.addEventListener('change', () => void loadStatement(true));
}

async function download(file: 'xlsx' | 'pdf'): Promise<void> {
  const c = selected();
  if (!c) return;
  const button = $<HTMLButtonElement>(file === 'xlsx' ? 'stmt-xlsx' : 'stmt-pdf')!;
  button.disabled = true;
  showBox('stmt-error', null);
  try {
    await downloadStatement(c.id, file, stmtFilters());
  } catch (error) {
    showBox('stmt-error', describe(error));
  } finally {
    button.disabled = false;
  }
}
$('stmt-xlsx')?.addEventListener('click', () => void download('xlsx'));
$('stmt-pdf')?.addEventListener('click', () => void download('pdf'));

// ---------- load + write access ----------

function applyWriteAccess(): void {
  // A company owner has read-only access inside a branch.
  canWrite = getSession()?.accessMode !== 'read_only';
  for (const id of ['cus-add', 'cus-edit', 'cus-toggle']) {
    const el = $(id);
    if (el) el.hidden = !canWrite;
  }
}

async function reload(): Promise<void> {
  const sess = getSession();
  const scope = $('cus-scope');
  if (scope && sess) scope.textContent = `${sess.activeBranchName} (${sess.activeBranchCode})`;
  applyWriteAccess();

  try {
    customers = await listCustomers();
    showBox('cus-load-error', canWrite ? null : 'Read-only: you are viewing this branch from Head Office.');
  } catch (error) {
    customers = [];
    showBox('cus-load-error', describe(error));
  }

  salesCache.clear();
  if (selectedId && !selected()) selectedId = null;
  // Like the design: the first customer is open when the page loads.
  if (!selectedId && customers.length && !firstLoadDone) selectedId = customers[0]!.id;
  firstLoadDone = true;
  renderKpis();
  renderTable();
  renderDetail();
  void loadSales();
  void loadStatement(true);
}

// ---------- form ----------

const dialog = $<HTMLDialogElement>('cus-dialog');
const form = $<HTMLFormElement>('cus-form');

function openForm(edit?: Customer): void {
  setText('cus-form-title', edit ? 'Edit customer' : 'New customer');
  input('f-id').value = edit ? String(edit.id) : '';
  input('f-name').value = edit?.name ?? '';
  $<HTMLSelectElement>('f-type')!.value = edit?.type ?? 'individual';
  $<HTMLSelectElement>('f-status')!.value = edit && !edit.isActive ? 'inactive' : 'active';
  input('f-phone').value = edit?.phone ?? '';
  input('f-email').value = edit?.email ?? '';
  input('f-address').value = edit?.address ?? '';
  input('f-pan').value = edit?.pan ?? '';
  input('f-credit').value = String(edit?.creditLimit ?? 0);
  input('f-notes').value = edit?.notes ?? '';
  showBox('f-error', null);
  dialog?.showModal();
}

$('cus-add')?.addEventListener('click', () => openForm());
$('cus-statement')?.addEventListener('click', () => {
  if (selectedId) window.location.href = statementUrl('customer', selectedId);
});

$('cus-edit')?.addEventListener('click', () => {
  const c = selected();
  if (c) openForm(c);
});
$('f-cancel')?.addEventListener('click', () => dialog?.close());

$('cus-toggle')?.addEventListener('click', async () => {
  const c = selected();
  if (!c) return;
  const next = !c.isActive;
  if (!next && !confirm(`Deactivate ${c.name}? They will no longer be offered on new sales.`)) return;

  const button = $<HTMLButtonElement>('cus-toggle')!;
  button.disabled = true;
  try {
    await setCustomerActive(c.id, next);
    await reload();
  } catch (error) {
    alert(describe(error));
  } finally {
    button.disabled = false;
  }
});

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const save = $<HTMLButtonElement>('f-save');
  showBox('f-error', null);

  const id = Number(input('f-id').value) || null;
  const payload: CustomerInput = {
    name: input('f-name').value,
    type: $<HTMLSelectElement>('f-type')!.value as CustomerType,
    isActive: $<HTMLSelectElement>('f-status')!.value === 'active',
    phone: input('f-phone').value,
    email: input('f-email').value,
    address: input('f-address').value,
    pan: input('f-pan').value,
    creditLimit: Number(input('f-credit').value || 0),
    notes: input('f-notes').value,
  };

  if (!payload.name.trim()) {
    showBox('f-error', 'Name is required.');
    return;
  }

  if (save) save.disabled = true;
  try {
    const saved = id ? await updateCustomer(id, payload) : await createCustomer(payload);
    selectedId = saved.id;
    dialog?.close();
    await reload();
    void loadStatement(true);
  } catch (error) {
    showBox('f-error', describe(error));
  } finally {
    if (save) save.disabled = false;
  }
});

$('cus-search')?.addEventListener('input', () => renderTable(true));
$('cus-type-filter')?.addEventListener('change', () => renderTable(true));
$('cus-status-filter')?.addEventListener('change', () => renderTable(true));
$('cus-dues-filter')?.addEventListener('change', () => renderTable(true));

void reload();
refreshProfile().then(applyWriteAccess).catch(() => {});
