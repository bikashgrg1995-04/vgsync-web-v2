import { can, getSession } from '../../lib/auth';
import { ApiError } from '../../lib/api';
import {
  REPORTS,
  metaOf,
  loadReport,
  downloadReport,
  formatNpr,
  formatQty,
  type ReportId,
  type ReportParams,
  type ReportData,
  type Ageing,
} from '../../lib/reports';

if (!getSession()) window.location.replace('/');

let current: ReportId = 'profit-loss';
let token = 0;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const val = (id: string) => $<HTMLInputElement>(id)?.value ?? '';

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const iso = (d: Date) => d.toLocaleDateString('en-CA');

function params(): ReportParams {
  const preset = val('rp-preset');
  const now = new Date();
  let dateFrom = '';
  let dateTo = '';
  if (preset === 'month') {
    dateFrom = iso(new Date(now.getFullYear(), now.getMonth(), 1));
    dateTo = iso(now);
  } else if (preset === '30') {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    dateFrom = iso(d);
    dateTo = iso(now);
  } else if (preset === 'year') {
    dateFrom = iso(new Date(now.getFullYear(), 0, 1));
    dateTo = iso(now);
  } else if (preset === 'custom') {
    dateFrom = val('rp-from');
    dateTo = val('rp-to');
  }
  return {
    dateFrom,
    dateTo,
    groupBy: val('rp-group') as ReportParams['groupBy'],
    by: val('rp-by') as ReportParams['by'],
    limit: Number(val('rp-limit')) || 10,
  };
}

function showError(message: string | null): void {
  const el = $('rp-error')!;
  el.hidden = !message;
  el.textContent = message ?? '';
}

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Reports are only available to the business owner.';
    const first = Object.values(error.fields)[0];
    return typeof first === 'string' ? first : error.message;
  }
  return 'Something went wrong. Please try again.';
}

// ---- Small building blocks ------------------------------------------

/** bike_sale -> Bike sale */
const pretty = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : 'Other');

const kpi = (label: string, value: string, tone = '') =>
  `<article class="rp-kpi ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`;

const kpis = (items: string[]) => `<div class="rp-kpis">${items.join('')}</div>`;

function table(head: { label: string; num?: boolean }[], rows: string[][], empty = 'Nothing to show for this period.'): string {
  if (rows.length === 0) return `<p class="rp-empty">${esc(empty)}</p>`;
  return `<div class="rp-table-wrap"><table class="rp-table">
    <thead><tr>${head.map((h) => `<th class="${h.num ? 'num' : ''}">${esc(h.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows
      .map((r) => `<tr>${r.map((c, i) => `<td class="${head[i]?.num ? 'num' : ''}">${c}</td>`).join('')}</tr>`)
      .join('')}</tbody></table></div>`;
}

/** Paired bars, one pair per label. `a` is drawn in the accent colour, `b` in the muted one. */
function bars(
  rows: { label: string; a: number; b?: number }[],
  names: { a: string; b?: string },
): string {
  if (rows.length === 0) return '';
  const max = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.a), Math.abs(r.b ?? 0)]));
  return `<div class="rp-chart" role="img" aria-label="${esc(names.a)}${names.b ? ' and ' + esc(names.b) : ''} by period">
    <div class="rp-legend"><span class="a">${esc(names.a)}</span>${names.b ? `<span class="b">${esc(names.b)}</span>` : ''}</div>
    <div class="rp-bars">${rows
      .map(
        (r) => `<div class="rp-col" title="${esc(r.label)}: ${esc(formatNpr(r.a))}${r.b !== undefined ? ' / ' + esc(formatNpr(r.b)) : ''}">
          <div class="rp-pair">
            <i class="a ${r.a < 0 ? 'neg' : ''}" style="height:${(Math.abs(r.a) / max) * 100}%"></i>
            ${r.b !== undefined ? `<i class="b" style="height:${(Math.abs(r.b) / max) * 100}%"></i>` : ''}
          </div>
          <span>${esc(r.label)}</span>
        </div>`,
      )
      .join('')}</div></div>`;
}

const ageingTable = (a: Ageing, who: string) =>
  table(
    [{ label: who }, { label: '0–30 days', num: true }, { label: '31–60', num: true }, { label: '61–90', num: true }, { label: 'Over 90', num: true }, { label: 'Total', num: true }],
    a.parties.map((p) => [esc(p.name), formatNpr(p.current), formatNpr(p.d31_60), formatNpr(p.d61_90), formatNpr(p.over90), `<strong>${formatNpr(p.total)}</strong>`]),
    `Nobody ${who === 'Customer' ? 'owes you anything' : 'is owed anything'} right now.`,
  );

const ageingKpis = (a: Ageing, totalLabel: string) =>
  kpis([
    kpi(totalLabel, formatNpr(a.total), 'strong'),
    kpi('0–30 days', formatNpr(a.buckets.current)),
    kpi('31–60 days', formatNpr(a.buckets.d31_60)),
    kpi('61–90 days', formatNpr(a.buckets.d61_90)),
    kpi('Over 90 days', formatNpr(a.buckets.over90), a.buckets.over90 > 0 ? 'danger' : ''),
  ]);

// ---- One renderer per report ----------------------------------------

function render(report: ReportData): string {
  switch (report.id) {
    case 'profit-loss': {
      const d = report.data;
      const cat = (rows: { category: string; total: number }[]) =>
        table([{ label: 'Category' }, { label: 'Amount', num: true }], rows.map((r) => [esc(pretty(r.category)), formatNpr(r.total)]), 'None in this period.');
      return `
        ${kpis([
          kpi('Income (net of refunds)', formatNpr(d.income.net)),
          kpi('Expenses (net of refunds)', formatNpr(d.expenses.net)),
          kpi(d.profit >= 0 ? 'Profit' : 'Loss', formatNpr(d.profit), d.profit >= 0 ? 'good' : 'danger'),
        ])}
        ${bars(d.byMonth.map((m) => ({ label: m.month, a: m.income, b: m.expenses })), { a: 'Income', b: 'Expenses' })}
        <div class="rp-two">
          <div><h3>Income</h3>${cat(d.income.byCategory)}<p class="rp-note">Total ${formatNpr(d.income.total)}${d.income.saleRefunds ? `, less ${formatNpr(d.income.saleRefunds)} refunded to customers` : ''}.</p></div>
          <div><h3>Expenses</h3>${cat(d.expenses.byCategory)}<p class="rp-note">Total ${formatNpr(d.expenses.total)}${d.expenses.purchaseRefunds ? `, less ${formatNpr(d.expenses.purchaseRefunds)} refunded by suppliers` : ''}.</p></div>
        </div>
        <h3>By month</h3>
        ${table([{ label: 'Month' }, { label: 'Income', num: true }, { label: 'Expenses', num: true }, { label: 'Profit', num: true }], d.byMonth.map((m) => [esc(m.month), formatNpr(m.income), formatNpr(m.expenses), `<strong class="${m.profit < 0 ? 'neg' : ''}">${formatNpr(m.profit)}</strong>`]))}
        <p class="rp-note">Cash basis: only money actually received or paid counts. A return that is not refunded in cash moves nothing.</p>`;
    }
    case 'receivables': {
      const d = report.data;
      return `${ageingKpis(d, 'Customers owe you')}
        ${d.emiOutstanding ? `<p class="rp-note">Not included: ${formatNpr(d.emiOutstanding)} on EMI sales, which fall due over months.</p>` : ''}
        ${ageingTable(d, 'Customer')}
        <p class="rp-note">Aged from the sale date.</p>`;
    }
    case 'payables': {
      const d = report.data;
      return `${ageingKpis(d, 'You owe suppliers')}${ageingTable(d, 'Supplier')}<p class="rp-note">Received purchases only, aged from the purchase date.</p>`;
    }
    case 'stock-value': {
      const d = report.data;
      return `
        ${kpis([
          kpi('Total stock value', formatNpr(d.totalValue), 'strong'),
          kpi(`Good stock (${formatQty(d.goodUnits)} units)`, formatNpr(d.goodValue)),
          kpi(`Damaged (${formatQty(d.damagedUnits)} units)`, formatNpr(d.damagedValue)),
        ])}
        ${d.productsWithoutPrice > 0 ? `<p class="rp-note is-warn">${d.productsWithoutPrice} product${d.productsWithoutPrice === 1 ? ' has' : 's have'} no purchase price and count as zero.</p>` : ''}
        ${table(
          [{ label: 'Stock no' }, { label: 'Product' }, { label: 'Cost', num: true }, { label: 'Good', num: true }, { label: 'Damaged', num: true }, { label: 'Good value', num: true }, { label: 'Damaged value', num: true }],
          d.products.map((p) => [`<span class="mono">${esc(p.stockNo)}</span>`, esc(p.name), formatNpr(p.purchasePrice), formatQty(p.quantity), formatQty(p.damagedQuantity), formatNpr(p.goodValue), formatNpr(p.damagedValue)]),
          'No stock on hand.',
        )}
        <p class="rp-note">Valued at purchase price, for this business only.</p>`;
    }
    case 'sales-trend': {
      const d = report.data;
      return `
        ${kpis([
          kpi('Sales', `${d.sales}`),
          kpi('Sold', formatNpr(d.total)),
          kpi('Returns', formatNpr(d.returns)),
          kpi('Net sales', formatNpr(d.net), 'strong'),
        ])}
        ${bars(d.periods.map((p) => ({ label: p.period, a: p.net })), { a: 'Net sales' })}
        ${table([{ label: 'Period' }, { label: 'Sales', num: true }, { label: 'Sold', num: true }, { label: 'Returns', num: true }, { label: 'Net', num: true }], d.periods.map((p) => [esc(p.period), String(p.sales), formatNpr(p.total), formatNpr(p.returns), `<strong>${formatNpr(p.net)}</strong>`]))}
        <p class="rp-note">Confirmed sales only; drafts and cancelled sales are left out.</p>`;
    }
    case 'top-products': {
      const d = report.data;
      return `${table(
        [{ label: '#' }, { label: 'Stock no' }, { label: 'Product' }, { label: 'Sold', num: true }, { label: 'Returned', num: true }, { label: 'Net qty', num: true }, { label: 'Revenue', num: true }],
        d.products.map((p, i) => [String(i + 1), `<span class="mono">${esc(p.stockNo || '—')}</span>`, esc(p.name), formatQty(p.quantity), formatQty(p.returnedQuantity), formatQty(p.netQuantity), `<strong>${formatNpr(p.revenue)}</strong>`]),
      )}<p class="rp-note">Revenue is the line total before any discount or VAT on the whole sale. Local items and service charges are listed under their name.</p>`;
    }
    case 'top-customers': {
      const d = report.data;
      return `${table(
        [{ label: '#' }, { label: 'Customer' }, { label: 'Sales', num: true }, { label: 'Bought', num: true }, { label: 'Returned', num: true }],
        d.customers.map((c, i) => [String(i + 1), esc(c.name), String(c.sales), `<strong>${formatNpr(c.total)}</strong>`, formatNpr(c.returns)]),
      )}<p class="rp-note">Walk-in sales, not tied to a customer: ${d.walkIn.sales} sale${d.walkIn.sales === 1 ? '' : 's'}, ${formatNpr(d.walkIn.total)}.</p>`;
    }
    case 'top-suppliers': {
      const d = report.data;
      return `${table(
        [{ label: '#' }, { label: 'Supplier' }, { label: 'Purchases', num: true }, { label: 'Bought', num: true }],
        d.suppliers.map((s, i) => [String(i + 1), esc(s.name), String(s.purchases), `<strong>${formatNpr(s.total)}</strong>`]),
      )}<p class="rp-note">Received and part-received purchases only.</p>`;
    }
    case 'salespeople': {
      const d = report.data;
      return `
        ${kpis([kpi('Sales', String(d.totals.sales)), kpi('Sold', formatNpr(d.totals.total))])}
        ${table(
          [{ label: 'Salesperson' }, { label: 'Sales', num: true }, { label: 'Stock / Bike / Service' }, { label: 'Sold', num: true }, { label: 'Collected', num: true }, { label: 'Due', num: true }],
          d.rows.map((p) => [esc(p.name), String(p.sales), `${p.stock} / ${p.bike} / ${p.maintenance}`, `<strong>${formatNpr(p.total)}</strong>`, formatNpr(p.collected), formatNpr(p.due)]),
          'No sales were confirmed in this period.',
        )}
        <p class="rp-note">Confirmed sales only, counted by sale date. Collected is the money received so far on those sales. Older sales without a recorded seller show as "Not recorded".</p>`;
    }
    case 'technicians': {
      const d = report.data;
      return `
        ${kpis([kpi('Jobs given', String(d.totals.assigned)), kpi('Jobs done', String(d.totals.done))])}
        ${table(
          [{ label: 'Technician' }, { label: 'Given', num: true }, { label: 'Done', num: true }, { label: 'Open', num: true }, { label: 'Normal / Free / Accident' }, { label: 'Avg hours', num: true }, { label: 'Billed', num: true }],
          d.rows.map((t) => [esc(t.name), String(t.assigned), `<strong>${t.done}</strong>`, String(t.pending + t.inProgress), `${t.normal} / ${t.free} / ${t.accident}`, t.averageHours === null ? '—' : String(t.averageHours), formatNpr(t.billed)]),
          'No jobs were given in this period.',
        )}
        <p class="rp-note">Jobs are counted by the day they were given. Hours run from when the technician started a job to when he finished it. Billed is the job total of finished jobs.</p>`;
    }
    case 'payroll-summary': {
      const d = report.data;
      return `
        ${kpis([
          kpi('Earned in period', formatNpr(d.earned)),
          kpi('Paid in period', formatNpr(d.paid)),
          kpi('Owed to staff now', formatNpr(d.owedNow), d.owedNow > 0 ? 'danger' : ''),
        ])}
        ${bars(d.byMonth.map((m) => ({ label: m.month, a: m.earned, b: m.paid })), { a: 'Earned', b: 'Paid' })}
        ${table([{ label: 'Staff' }, { label: 'Earned', num: true }, { label: 'Paid', num: true }, { label: 'Owed now', num: true }], d.staff.map((s) => [esc(s.name), formatNpr(s.earned), formatNpr(s.paid), `<strong>${formatNpr(s.owedNow)}</strong>`]), 'No payroll in this period.')}
        <p class="rp-note">Earned is salary, wages and bonus less deductions. "Owed now" is everything earned to date less everything paid, whatever the period.</p>`;
    }
  }
}

// ---- Load ------------------------------------------------------------

function syncControls(): void {
  const meta = metaOf(current);
  $('rp-title')!.textContent = meta.label;
  $('rp-hint')!.textContent = meta.hint;
  document.querySelectorAll<HTMLElement>('[data-ctl]').forEach((el) => {
    const ctl = el.dataset.ctl as 'dates' | 'groupBy' | 'by' | 'limit';
    let show = Boolean(meta[ctl]);
    if (el.classList.contains('rp-custom')) show = show && val('rp-preset') === 'custom';
    el.hidden = !show;
  });
}

async function load(): Promise<void> {
  const mine = ++token;
  const body = $('rp-body')!;
  body.innerHTML = `<p class="rp-empty">Loading…</p>`;
  showError(null);
  syncControls();
  try {
    const report = await loadReport(current, params());
    if (mine !== token) return;
    body.innerHTML = render(report);
  } catch (error) {
    if (mine !== token) return;
    body.innerHTML = '';
    showError(describe(error));
  }
}

// Payroll is the owner's: other positions never see that report.
function visibleReports() {
  return REPORTS.filter((r) => r.id !== 'payroll-summary' || can(getSession(), 'staff.pay_view'));
}

function renderChips(): void {
  $('rp-chips')!.innerHTML = visibleReports().map(
    (r) => `<button type="button" class="rp-chip ${r.id === current ? 'is-active' : ''}" data-report="${r.id}">${esc(r.label)}</button>`,
  ).join('');
  document.querySelectorAll<HTMLButtonElement>('[data-report]').forEach((b) =>
    b.addEventListener('click', () => {
      current = b.dataset.report as ReportId;
      renderChips();
      void load();
    }),
  );
}

for (const id of ['rp-preset', 'rp-from', 'rp-to', 'rp-group', 'rp-by', 'rp-limit']) {
  $(id)?.addEventListener('change', () => void load());
}

async function download(file: 'xlsx' | 'pdf'): Promise<void> {
  const btn = $<HTMLButtonElement>(file === 'xlsx' ? 'rp-xlsx' : 'rp-pdf')!;
  btn.disabled = true;
  showError(null);
  try {
    await downloadReport(current, file, params());
  } catch (error) {
    showError(describe(error));
  } finally {
    btn.disabled = false;
  }
}
$('rp-xlsx')?.addEventListener('click', () => void download('xlsx'));
$('rp-pdf')?.addEventListener('click', () => void download('pdf'));

document.getElementById('branch-select')?.addEventListener('change', () => setTimeout(() => void init(), 300));

function init(): void {
  const s = getSession();
  if (s) $('rp-scope')!.textContent = `${s.activeBranchName} (${s.activeBranchCode})`;
  renderChips();
  void load();
}

init();
