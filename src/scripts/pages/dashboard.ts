import { can, getSession } from '../../lib/auth';
import { listSales, type Sale } from '../../lib/sales';
import { listFollowups, type Followup } from '../../lib/sales';
import { listStock, getInventorySummary, type StockItem } from '../../lib/inventory';
import { listOrders, type OrderSummary } from '../../lib/orders';
import { listTasks, type Task } from '../../lib/tasks';
import { loadDashboard, formatNpr, type Dashboard } from '../../lib/reports';

const session = getSession();
if (!session) window.location.replace('/');

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const iso = (d: Date) => d.toLocaleDateString('en-CA');
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5);
const kpi = (label: string, value: string, sub = '', tone = '', href = '') =>
  `<${href ? 'a href="' + href + '"' : 'article'} class="ov-kpi ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${sub ? `<em>${esc(sub)}</em>` : ''}</${href ? 'a' : 'article'}>`;
const empty = (t: string) => `<p class="ov-empty">${esc(t)}</p>`;
let run = 0;

function chart(sales: Sale[]): string {
  const days: { key: string; label: string; total: number }[] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = daysAgo(i);
    days.push({ key: iso(d), label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), total: 0 });
  }
  for (const s of sales) {
    const d = days.find((x) => x.key === s.saleDate);
    if (d) d.total += s.netTotal;
  }
  const max = Math.max(...days.map((d) => d.total), 1);
  if (days.every((d) => d.total === 0)) return empty('No confirmed sales in the last 14 days.');
  return `<div class="ov-bars">${days
    .map((d) => `<div class="ov-bar" title="${esc(d.label)}: ${esc(formatNpr(d.total))}"><i style="height:${Math.max((d.total / max) * 100, d.total ? 3 : 0)}%"></i><span>${d.label.split(' ')[0]}</span></div>`)
    .join('')}</div>`;
}

/** Open tasks handed to me: overdue first, then by due date. */
function myTasksHtml(tasks: Task[]): string {
  if (tasks.length === 0) return empty('Nothing waiting for you.');
  const sorted = [...tasks].sort(
    (a, b) =>
      Number(b.isOverdue) - Number(a.isOverdue) ||
      (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
  );
  const rows = sorted.slice(0, 6).map((t) => {
    const due = t.dueDate ? `${t.isOverdue ? 'overdue · ' : 'due '}${esc(t.dueDate)}` : 'no due date';
    return `<li><span><a href="/tasks?id=${t.id}">${esc(t.title)}</a><em>${due}${t.status === 'in_progress' ? ' · in progress' : ''}</em></span>${t.isOverdue ? '<b class="ov-tag">Overdue</b>' : t.priority === 'high' ? '<b class="ov-tag">High</b>' : ''}</li>`;
  });
  const more = sorted.length > 6 ? `<p class="ov-empty">+ ${sorted.length - 6} more</p>` : '';
  return `<ul class="ov-list">${rows.join('')}</ul>${more}`;
}

async function load(): Promise<void> {
  const mine = ++run;
  const s = getSession();
  if (!s) return;
  $('ov-title').textContent = `Welcome back, ${s.displayName.split(' ')[0]}!`;
  $('ov-sub').textContent = `Here's what's happening with ${s.activeBranchName} today.`;
  const month = iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const from14 = iso(daysAgo(13));
  const from = month < from14 ? month : from14;
  const today = iso(new Date());

  const [sales, follow, stock, orders, myTasks] = await Promise.all([
    listSales({ status: 'confirmed', dateFrom: from }).catch(() => null),
    listFollowups({ status: 'pending' }).catch(() => null),
    // Stock is only readable by people who sell, buy or manage it.
    ['inventory.view', 'sales.create', 'purchases.create'].some((c) => can(s, c))
      ? listStock().catch(() => null)
      : Promise.resolve(null),
    s.businessType === 'independent' || s.role === 'staff' ? Promise.resolve(null) : listOrders().catch(() => null),
    listTasks({ mine: 'true', status: 'todo,in_progress' }).catch(() => null),
  ]);
  if (mine !== run) return;

  $('ov-mytasks-card').hidden = myTasks === null || session?.isOwner === true;
  if (myTasks) $('ov-mytasks').innerHTML = myTasksHtml(myTasks);

  const kpis: string[] = [];
  // People with the full dashboard get these two in its own cards below.
  if (sales && !can(s, 'dashboard.view')) {
    const t = sales.filter((x) => x.saleDate === today);
    const m = sales.filter((x) => x.saleDate >= month);
    kpis.push(kpi("Today's sales", formatNpr(t.reduce((a, x) => a + x.netTotal, 0)), `${t.length} sale${t.length === 1 ? '' : 's'}`, 'strong', '/sales'));
    kpis.push(kpi('This month', formatNpr(m.reduce((a, x) => a + x.netTotal, 0)), `${m.length} sale${m.length === 1 ? '' : 's'}`));
  }
  if (follow) {
    const over = follow.filter((f: Followup) => f.isOverdue).length;
    kpis.push(kpi('Follow-ups pending', String(follow.length), over ? `${over} overdue` : 'none overdue', over ? 'danger' : '', '/sales'));
  }
  if (stock) {
    const sm = getInventorySummary(stock);
    kpis.push(kpi('Low or out of stock', String(sm.lowCount + sm.outCount), `${sm.outCount} out · ${sm.lowCount} low`, sm.outCount ? 'danger' : '', '/inventory'));
  }
  if (orders) {
    const open = orders.filter((o: OrderSummary) => ['ordered', 'partially_dispatched', 'dispatched', 'partially_received'].includes(o.status));
    kpis.push(kpi('Open stock orders', String(open.length), s.businessType === 'branch' ? 'with Head Office' : 'from branches', '', '/orders'));
  }
  $('ov-kpis').innerHTML = kpis.join('');

  $('ov-chart').innerHTML = sales ? chart(sales) : empty('Sales are not available for you.');
  $('ov-sales').innerHTML = sales
    ? sales.length
      ? `<ul class="ov-list">${[...sales].sort((a, b) => b.id - a.id).slice(0, 6).map((x) => `<li><span>${esc(x.customerName || x.walkInName || 'Walk-in')}<em>${esc(x.invoiceNo || x.saleNo)} · ${esc(x.saleDate)}</em></span><strong>${formatNpr(x.netTotal)}</strong></li>`).join('')}</ul>`
      : empty('No sales yet this month.')
    : empty('Not available.');

  $('ov-follow').innerHTML = follow
    ? follow.length
      ? `<ul class="ov-list">${[...follow].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6).map((f) => `<li><span>${esc(f.customerName || '—')}<em>${esc(f.kind.replace(/_/g, ' '))} · due ${esc(f.dueDate)}</em></span>${f.isOverdue ? '<b class="ov-tag">Overdue</b>' : f.amount ? `<strong>${formatNpr(f.amount)}</strong>` : ''}</li>`).join('')}</ul>`
      : empty('Nothing pending.')
    : empty('Not available.');

  $('ov-stock').innerHTML = stock
    ? (() => {
        const watch = stock.filter((i: StockItem) => i.status !== 'in_stock').sort((a, b) => a.quantity - b.quantity).slice(0, 7);
        return watch.length
          ? `<ul class="ov-list">${watch.map((i) => `<li><span>${esc(i.name)}<em>${esc(i.stockNo)}</em></span><strong class="${i.status === 'out' ? 'neg' : ''}">${i.status === 'out' ? 'Out' : i.quantity + ' left'}</strong></li>`).join('')}</ul>`
          : empty('All stock is above its reorder level.');
      })()
    : empty('Not available.');

  await loadOwner(mine, s);
}

// The owner dashboard: real numbers from one API call (needs dashboard.view).
const SPARK = { sales: '#2563eb', purchases: '#16a34a', income: '#7c3aed', expenses: '#f59e0b' } as const;
const spark = (values: number[], color: string): string => {
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * 100},${28 - (v / max) * 26}`).join(' ');
  return `<svg class="ov-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" points="${pts}"/></svg>`;
};
const n = (v: string | number) => Number(v);
const short = (v: number) => (v >= 1e7 ? `${+(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `${+(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `${+(v / 1e3).toFixed(0)}k` : String(Math.round(v)));
const inDays = (d: number | null) => (d === null ? '' : d < 0 ? `overdue ${-d} day${d === -1 ? '' : 's'}` : d === 0 ? 'due today' : `due in ${d} day${d === 1 ? '' : 's'}`);

function lineChart(o: Dashboard['overview']): string {
  const series = [
    { name: 'Sales', color: SPARK.sales, v: o.sales.series.map(n) },
    { name: 'Purchase', color: SPARK.purchases, v: o.purchases.series.map(n) },
    { name: 'Expenses', color: SPARK.expenses, v: o.expenses.series.map(n) },
  ];
  const max = Math.max(...series.flatMap((x) => x.v), 1);
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;
  const W = 640, H = 165, L = 44, R = 8, T = 8, B = 24;
  const x = (i: number) => L + (i / Math.max(o.days - 1, 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const grid = [0, 1, 2, 3, 4].map((k) => {
    const val = (top / 4) * k;
    return `<line x1="${L}" x2="${W - R}" y1="${y(val)}" y2="${y(val)}" class="ov-grid-line"/><text x="${L - 6}" y="${y(val) + 3}" text-anchor="end" class="ov-axis">${short(val)}</text>`;
  }).join('');
  const every = Math.ceil(o.days / 8);
  const ticks = o.labels.map((d, i) => (i % every === 0 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="ov-axis">${new Date(d + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</text>` : '')).join('');
  const lines = series.map((sr) => {
    const pts = sr.v.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    const dots = o.days <= 31 ? sr.v.map((v, i) => (v > 0 ? `<circle cx="${x(i)}" cy="${y(v)}" r="2.6" fill="${sr.color}"><title>${esc(sr.name)} ${esc(o.labels[i])}: ${esc(formatNpr(v))}</title></circle>` : '')).join('') : '';
    return `<polyline fill="none" stroke="${sr.color}" stroke-width="2.2" stroke-linejoin="round" points="${pts}"/>${dots}`;
  }).join('');
  const legend = series.map((sr) => `<span><i style="background:${sr.color}"></i>${sr.name}</span>`).join('');
  return `<div class="ov-legend">${legend}</div><svg class="ov-line" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sales, purchase and expenses over the period">${grid}${ticks}${lines}</svg>`;
}

function tiles(o: Dashboard['overview']): string {
  const defs: Array<[string, string, 'sales' | 'purchases' | 'income' | 'expenses', string]> = [
    ['Total Sales', '🛒', 'sales', 'tile-sales'],
    ['Total Purchase', '📦', 'purchases', 'tile-purchases'],
    ['Income', '📈', 'income', 'tile-income'],
    ['Expenses', '👛', 'expenses', 'tile-expenses'],
  ];
  return defs.map(([label, icon, key, cls]) => {
    const b = o[key];
    const pct = b.change_pct;
    const good = key === 'expenses' || key === 'purchases' ? (pct ?? 0) <= 0 : (pct ?? 0) >= 0;
    const change = pct === null ? '<em class="ov-pct">no earlier data</em>' : `<em class="ov-pct ${good ? 'up' : 'down'}">${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct)}%</em>`;
    return `<article class="ov-tile ${cls}"><div class="ov-tile-top"><span class="ov-tile-ico" aria-hidden="true">${icon}</span><span>${label}</span></div><strong>${esc(formatNpr(n(b.total)))}</strong>${change}${spark(b.series.map(n), SPARK[key])}</article>`;
  }).join('');
}

const alertCard = (cls: string, icon: string, title: string, value: string, sub: string, href: string) =>
  `<a class="ov-due-card ${cls}" href="${href}"><span class="ov-due-ico" aria-hidden="true">${icon}</span><span class="ov-due-body"><b>${esc(title)}</b><strong>${esc(value)}</strong><em>${esc(sub)}</em></span><span class="ov-due-view">View →</span></a>`;

let range = 30;

async function loadOwner(mine: number, s: NonNullable<ReturnType<typeof getSession>>): Promise<void> {
  const block = $('ov-owner');
  const full = can(s, 'dashboard.view');
  // The full dashboard replaces the simple widgets below.
  $('ov-legacy').hidden = full;
  $('ov-kpis').hidden = full;
  if (!full) {
    block.hidden = true;
    return;
  }
  let d: Dashboard;
  try {
    d = await loadDashboard(range);
    // An older backend answers without the new blocks.
    if (!d.due || !d.installments || !d.overview) throw new Error('outdated backend');
  } catch {
    block.hidden = false;
    $('ov-alerts').innerHTML = '';
    $('ov-due').innerHTML = '';
    $('ov-owner-kpis').innerHTML = empty('Dashboard figures are not available right now. If this keeps happening, update the backend (git pull, migrate) and restart it.');
    return;
  }
  if (mine !== run) return;
  block.hidden = false;

  $('ov-alerts').innerHTML = d.alerts
    .filter((a) => a.kind !== 'low_stock')
    .map((a) => `<p class="ov-alert is-${a.severity}">${esc(a.message)}</p>`)
    .join('');

  const due = d.due;
  $('ov-due').innerHTML = [
    alertCard('is-emi', '🗓', 'Installment Due Soon', `${due.installments.count} installment${due.installments.count === 1 ? '' : 's'}`, due.installments.count ? 'are due within 3 days' : 'none due within 3 days', '/sales#followups'),
    alertCard('is-pay', '💳', 'Purchase Credit Due', formatNpr(n(due.purchase_credit.amount)), inDays(due.purchase_credit.days) || 'nothing due this week', '/purchase'),
    alertCard('is-recv', '💰', 'Sales Credit Due', formatNpr(n(due.sales_credit.amount)), inDays(due.sales_credit.days) || 'nothing due this week', '/sales#followups'),
    alertCard('is-serv', '🔧', 'Servicing Follow-ups', `${due.servicing.count} customer${due.servicing.count === 1 ? '' : 's'}`, due.servicing.count ? 'need follow-up' : 'all caught up', '/sales#followups'),
  ].join('');

  $('ov-tiles').innerHTML = tiles(d.overview);
  $('ov-linechart').innerHTML = lineChart(d.overview);

  $('ov-installments').innerHTML = d.installments.length
    ? `<ul class="ov-list">${d.installments.map((i) => `<li><span class="ov-bikeico" aria-hidden="true">🏍</span><span class="ov-grow"><b>${esc(i.customer || i.sale)}</b><em>${esc(i.sale)} · Installment ${i.number}${i.of ? ' of ' + i.of : ''}</em></span><span class="ov-right"><span class="ov-chip ${i.days <= 2 ? 'hot' : ''}">${esc(inDays(i.days))}</span><em>${esc(new Date(i.due_date + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}</em></span></li>`).join('')}</ul>`
    : empty('No installments are waiting.');

  $('ov-credit').innerHTML = `<ul class="ov-list ov-credit">
    <li><span class="ov-credit-ico is-pay" aria-hidden="true">🛒</span><span class="ov-grow">Purchase Credit <em>(To Give)</em></span><strong>${esc(formatNpr(n(d.payables)))}</strong>${due.purchase_credit.days !== null ? `<span class="ov-chip ${due.purchase_credit.days < 0 ? 'hot' : 'good'}">${esc(inDays(due.purchase_credit.days))}</span>` : ''}</li>
    <li><span class="ov-credit-ico is-recv" aria-hidden="true">🛍</span><span class="ov-grow">Sales Credit <em>(To Receive)</em></span><strong>${esc(formatNpr(n(d.receivables)))}</strong>${due.sales_credit.days !== null ? `<span class="ov-chip ${due.sales_credit.days < 0 ? 'hot' : 'soft'}">${esc(inDays(due.sales_credit.days))}</span>` : ''}</li></ul>`;

  const m = (v: string) => n(v);
  $('ov-owner-kpis').innerHTML = [
    kpi('Profit (cash)', formatNpr(m(d.profit_month)), 'this month', m(d.profit_month) < 0 ? 'danger' : 'strong', '/reports'),
    kpi('Cash in hand', formatNpr(m(d.cash.cash))),
    kpi('In the bank', formatNpr(m(d.cash.bank)), d.cash.other !== '0.00' ? `+ ${formatNpr(m(d.cash.other))} other` : ''),
    kpi('Stock value', formatNpr(m(d.stock.value)), d.stock.damaged_value !== '0.00' ? `${formatNpr(m(d.stock.damaged_value))} damaged` : '', '', '/inventory'),
    kpi('Approvals waiting', String(d.approvals_pending), `${d.staff.active} active staff`, d.approvals_pending ? 'strong' : '', '/approvals'),
  ].join('');

  $('ov-low').innerHTML = d.low_stock.items.length
    ? `<ul class="ov-list">${d.low_stock.items.slice(0, 5).map((p) => `<li><span class="ov-warn" aria-hidden="true">⚠</span><span class="ov-grow">${esc(p.name)}</span><span class="ov-stock-n">Stock: ${esc(String(Number(p.quantity)))}</span><span class="ov-chip hot">${Number(p.quantity) <= 0 ? 'Out' : 'Low Stock'}</span></li>`).join('')}</ul>`
    : empty('Nothing is below its reorder level.');

  $('ov-servicing').innerHTML = d.servicing.length
    ? `<ul class="ov-list">${d.servicing.map((f) => `<li><span class="ov-grow"><b>${esc(f.customer || '—')}</b><em>${esc(f.kind === 'maintenance_post' ? 'Post-service check' : 'Maintenance follow-up')}</em></span><span class="ov-right"><em class="${f.overdue ? 'neg' : ''}">${esc(new Date(f.due_date + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}</em></span>${f.phone ? `<a class="ov-contact" href="tel:${esc(f.phone.split('/')[0].trim())}">Contact</a>` : ''}</li>`).join('')}</ul>`
    : empty('No servicing follow-ups pending.');

  const ago = (iso: string) => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} hr ago` : `${Math.round(mins / 1440)} d ago`;
  };
  $('ov-activity').innerHTML = d.activity.length
    ? `<ul class="ov-timeline">${d.activity.map((a) => `<li class="k-${esc(a.kind)}"><span>${esc(a.text)}</span><em>${esc(ago(a.at))}</em></li>`).join('')}</ul>`
    : empty('Nothing has happened yet.');

  const branches = d.branches ?? [];
  $('ov-branches').hidden = branches.length === 0;
  $('ov-branches-body').innerHTML = branches
    .map(
      (b) => `<tr><td>${esc(b.name)}<em>${esc(b.business_code)}</em></td><td>${esc(formatNpr(n(b.sales_today)))}</td><td>${esc(formatNpr(n(b.sales_month)))}</td><td>${esc(formatNpr(n(b.purchases_month)))}</td><td class="${n(b.profit_month) < 0 ? 'neg' : ''}">${esc(formatNpr(n(b.profit_month)))}</td><td>${esc(formatNpr(n(b.receivables)))}</td><td>${b.low_stock}</td></tr>`,
    )
    .join('');
}

$('ov-range').addEventListener('change', (e) => {
  range = Number((e.target as HTMLSelectElement).value) || 30;
  void load();
});

$('ov-refresh').addEventListener('click', () => void load());
document.getElementById('branch-select')?.addEventListener('change', () => setTimeout(() => void load(), 300));
const tick = () => {
  $('ov-now').textContent = new Date().toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + ' • ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};
tick();
setInterval(tick, 30000);
void load();
