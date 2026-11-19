import { can, getSession } from '../../lib/auth';
import { ApiError } from '../../lib/api';
import { listPositions, listStaff, type StaffMember } from '../../lib/staff';
import {
  listLedger,
  ledgerSummary,
  createLedger,
  updateLedger,
  voidLedger,
  listBalances,
  getIncentives, applyIncentives, listIncentiveRules, saveIncentiveRule, deleteIncentiveRule, INCENTIVE_BASIS_LABEL,
  type IncentiveRow, type IncentiveRule, type IncentiveBasis,
  getBalance,
  listStatement,
  listSalaries,
  saveSalary,
  getWorkSheet,
  saveWorkSheet,
  type WorkRow,
  type WorkStatus,
  addEntry,
  voidEntry,
  addPayrollPayment,
  voidPayrollPayment,
  formatNpr,
  EXPENSE_LABEL,
  INCOME_LABEL,
  METHOD_LABEL,
  MANUAL_EXPENSE,
  type LedgerKind,
  type LedgerEntry,
  type LedgerSummary,
  type PayBalance,
  type PayMethod,
  type PayType,
  type EntryKind,
  type SalaryProfile,
  type MethodBalance,
  getBalances,
  listChecks,
  saveCheck,
  setOpeningBalance,
} from '../../lib/payments';

if (!getSession()) window.location.replace('/');

// Pay and cash tabs follow the permission (the owner holds all); others see their own pay on My pay.
{
  const me = getSession();
  const tabCode: Record<string, string> = { payroll: 'staff.pay_view', daily: 'staff.pay_view', incentives: 'staff.pay_view', cash: 'finance.reconcile' };
  for (const [t, code] of Object.entries(tabCode)) {
    if (!can(me, code)) document.querySelector<HTMLElement>(`[data-tab="${t}"]`)?.setAttribute('hidden', '');
  }
}

type Tab = 'expenses' | 'income' | 'payroll' | 'daily' | 'incentives' | 'cash';
let tab: Tab = 'expenses';
let canWrite = true;
let canPay = true; // record salary payments, wages, bonuses (staff.pay)
let canSetup = true; // set salary rates: owner only
let entries: LedgerEntry[] = [];
let balances: PayBalance[] = [];
let staff: StaffMember[] = [];
let salaries: SalaryProfile[] = [];
let selectedId: number | null = null;
let token = 0;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const val = (id: string) => $<HTMLInputElement>(id)?.value ?? '';
const today = () => new Date().toLocaleDateString('en-CA');
const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pretty = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '—');
const dlg = (id: string) => $<HTMLDialogElement>(id)!;
const kindOf = (): LedgerKind => (tab === 'income' ? 'income' : 'expenses');
const labelOf = (cat: string) =>
  (kindOf() === 'expenses' ? EXPENSE_LABEL : INCOME_LABEL)[cat as keyof typeof EXPENSE_LABEL & keyof typeof INCOME_LABEL] ?? pretty(cat);

document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((b) =>
  b.addEventListener('click', () => dlg(b.dataset.close!).close()),
);

const FIELDS: Record<string, string> = {
  amount: 'Amount',
  category: 'Category',
  expense_date: 'Date',
  income_date: 'Date',
  paid_on: 'Paid on',
  entry_date: 'Date',
  rate: 'Salary',
  allowances: 'Allowances',
  salary_day: 'Salary day',
  staff: 'Staff',
  reason: 'Reason',
};

function flatten(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(flatten).filter(Boolean).join(' ');
  if (v && typeof v === 'object') return Object.values(v).map(flatten).filter(Boolean).join(' ');
  return '';
}

function describe(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  if (error.status === 403) return 'This page is only available to the business owner.';
  const e = Object.entries(error.fields);
  if (e.length > 0 && error.status === 400) {
    return e.map(([k, v]) => (FIELDS[k] ? `${FIELDS[k]}: ${flatten(v)}` : flatten(v))).join(' ');
  }
  return error.message;
}

function showError(id: string, message: string | null): void {
  const el = $(id);
  if (!el) return;
  el.hidden = !message;
  el.textContent = message ?? '';
}

function notice(message: string | null, error = false): void {
  const el = $('py-notice')!;
  el.hidden = !message;
  el.textContent = message ?? '';
  el.classList.toggle('is-error', error);
}

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

const kpi = (label: string, value: string, tone = '') =>
  `<article class="py-kpi ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`;

const badge = (cls: string, text: string) => `<span class="py-badge py-badge-${cls}">${esc(text)}</span>`;

// ---- Reason dialog ---------------------------------------------------

let reasonWork: ((reason: string) => Promise<void>) | null = null;

function askReason(title: string, sub: string, work: (reason: string) => Promise<void>): void {
  $('rs-title')!.textContent = title;
  $('rs-sub')!.textContent = sub;
  $<HTMLInputElement>('rs-text')!.value = '';
  showError('rs-error', null);
  reasonWork = work;
  dlg('dlg-reason').showModal();
}

$('form-reason')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const reason = val('rs-text').trim();
  if (!reason || !reasonWork) return;
  void submit('rs-save', 'rs-error', 'dlg-reason', async () => {
    await reasonWork!(reason);
    await refresh();
  });
});

// ---- Expenses and income ---------------------------------------------

function ledgerFilters() {
  return {
    category: val('lg-category'),
    status: val('lg-status') as 'active' | 'void' | '',
    dateFrom: val('lg-from'),
    dateTo: val('lg-to'),
  };
}

function fillCategoryFilter(): void {
  const labels = kindOf() === 'expenses' ? EXPENSE_LABEL : INCOME_LABEL;
  const sel = $<HTMLSelectElement>('lg-category')!;
  sel.innerHTML =
    `<option value="">All categories</option>` +
    Object.entries(labels).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
}

function renderLedger(summary: LedgerSummary | null): void {
  const expenses = kindOf() === 'expenses';
  $('lg-kpis')!.innerHTML = summary
    ? [
        kpi(expenses ? 'Spent' : 'Received', formatNpr(summary.total)),
        kpi(expenses ? 'Refunded by suppliers' : 'Refunded to customers', formatNpr(summary.refunds)),
        kpi(expenses ? 'Net spent' : 'Net income', formatNpr(summary.net), 'strong'),
      ].join('') + (summary.byCategory.length
        ? `<article class="py-kpi wide"><span>By category</span><div class="py-cats">${summary.byCategory
            .map((c) => `<em>${esc(labelOf(c.category))} <b>${formatNpr(c.total)}</b></em>`).join('')}</div></article>`
        : '')
    : '';

  const tbody = $('lg-tbody')!;
  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-empty">${expenses ? 'No expenses' : 'No income'} found.</td></tr>`;
  } else {
    tbody.innerHTML = entries
      .map((r) => {
        const acts: string[] = [];
        if (canWrite && r.status === 'active' && !r.locked) {
          if (kindOf() === 'expenses') acts.push(`<button class="btn-link" data-edit="${r.id}">Edit</button>`);
          acts.push(`<button class="btn-link is-danger" data-void="${r.id}">Void</button>`);
        }
        const detail = [r.description, r.reference ? `Ref ${r.reference}` : ''].filter(Boolean).map(esc).join(' · ');
        return `<tr class="${r.status === 'void' ? 'is-void' : ''}">
          <td>${esc(r.date)}</td>
          <td>${esc(labelOf(r.category))}${r.locked ? ' <span class="py-lock" title="Created by a payment. Void the payment to remove it.">auto</span>' : ''}</td>
          <td>${detail || '—'}${r.status === 'void' && r.voidReason ? `<br /><span class="muted">Voided: ${esc(r.voidReason)}</span>` : ''}</td>
          <td>${r.method ? esc(METHOD_LABEL[r.method as PayMethod] ?? r.method) : '—'}</td>
          <td class="num">${formatNpr(r.amount)}</td>
          <td>${r.status === 'void' ? badge('void', 'Void') : badge('ok', 'Active')}</td>
          <td class="actions">${acts.join(' ')}</td>
        </tr>`;
      })
      .join('');
  }
  $('lg-foot')!.textContent =
    `${entries.length} ${expenses ? 'expense' : 'income'} line${entries.length === 1 ? '' : 's'}.` +
    (expenses
      ? ' Lines marked "auto" come from staff and supplier payments; void the payment to remove them.'
      : ' Lines marked "auto" come from customer payments; void the payment to remove them.');

  tbody.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => openLedger(entries.find((x) => x.id === Number(b.dataset.edit)))),
  );
  tbody.querySelectorAll<HTMLButtonElement>('[data-void]').forEach((b) =>
    b.addEventListener('click', () =>
      askReason(`Void this ${kindOf() === 'expenses' ? 'expense' : 'income'}`, 'It stops counting in totals and reports.', async (reason) => {
        await voidLedger(kindOf(), Number(b.dataset.void), reason);
      }),
    ),
  );
}

async function loadLedger(): Promise<void> {
  const mine = ++token;
  try {
    const f = ledgerFilters();
    const [list, summary] = await Promise.all([listLedger(kindOf(), f), ledgerSummary(kindOf(), f)]);
    if (mine !== token) return;
    entries = list;
    notice(canWrite ? null : 'Read-only: you are viewing this branch from Head Office.');
    renderLedger(summary);
  } catch (error) {
    if (mine !== token) return;
    entries = [];
    notice(describe(error), true);
    renderLedger(null);
  }
}

function openLedger(entry?: LedgerEntry): void {
  const expenses = kindOf() === 'expenses';
  $('lf-title')!.textContent = entry ? 'Edit expense' : expenses ? 'Add expense' : 'Add income';
  $<HTMLInputElement>('lf-id')!.value = entry ? String(entry.id) : '';
  // Salary, purchase and the sale categories come from payments.
  const cats: [string, string][] = expenses
    ? MANUAL_EXPENSE.map((c) => [c, EXPENSE_LABEL[c]])
    : [['other', INCOME_LABEL.other]];
  $<HTMLSelectElement>('lf-category')!.innerHTML = cats.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
  $<HTMLSelectElement>('lf-category')!.value = entry?.category ?? cats[0][0];
  $<HTMLInputElement>('lf-amount')!.value = entry ? String(entry.amount) : '';
  $<HTMLInputElement>('lf-date')!.value = entry?.date ?? today();
  $<HTMLInputElement>('lf-date')!.max = today();
  $<HTMLSelectElement>('lf-method')!.value = entry?.method ?? '';
  $<HTMLInputElement>('lf-ref')!.value = entry?.reference ?? '';
  $<HTMLInputElement>('lf-desc')!.value = entry?.description ?? '';
  showError('lf-error', null);
  dlg('dlg-ledger').showModal();
}

$('form-ledger')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = Number(val('lf-id')) || 0;
  const input = {
    category: val('lf-category'),
    amount: Number(val('lf-amount')),
    date: val('lf-date'),
    description: val('lf-desc'),
    method: val('lf-method') as PayMethod | '',
    reference: val('lf-ref'),
  };
  void submit('lf-save', 'lf-error', 'dlg-ledger', async () => {
    if (id) await updateLedger(kindOf(), id, input);
    else await createLedger(kindOf(), input);
    await refresh();
  });
});

// ---- Payroll ---------------------------------------------------------

const payLabel = (t: PayType) => (t === 'monthly' ? 'Monthly' : 'Daily');

function renderPayrollKpis(): void {
  const owed = balances.reduce((s, b) => s + b.remaining, 0);
  const advance = balances.reduce((s, b) => s + b.advance, 0);
  const owing = balances.filter((b) => b.remaining > 0).length;
  $('pr-kpis')!.innerHTML = [
    kpi('Staff with pay set up', String(balances.length)),
    kpi('Owed to staff now', formatNpr(owed), owed > 0 ? 'danger' : ''),
    kpi('Staff owed money', String(owing)),
    kpi('Paid ahead (advance)', formatNpr(advance)),
  ].join('');
}

function renderSetup(): void {
  const el = $('pr-setup')!;
  const have = new Set(salaries.map((s) => s.staffId));
  const missing = staff.filter((s) => s.isActive && !have.has(s.id));
  el.hidden = missing.length === 0 || !canSetup;
  if (el.hidden) return;
  el.innerHTML =
    `<strong>No pay set up yet:</strong> ` +
    missing.map((s) => `<button type="button" class="py-chip" data-setup="${s.id}">${esc(s.name || s.username)} · Set pay</button>`).join('');
  el.querySelectorAll<HTMLButtonElement>('[data-setup]').forEach((b) =>
    b.addEventListener('click', () => openSalary(Number(b.dataset.setup))),
  );
}

function renderBalances(): void {
  const tbody = $('pr-tbody')!;
  if (balances.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-empty">No staff pay yet. Set up pay for a person above.</td></tr>`;
    return;
  }
  tbody.innerHTML = balances
    .map((b) => `<tr class="py-row ${selectedId === b.staffId ? 'is-selected' : ''}" data-id="${b.staffId}">
      <td>${esc(b.name)}${b.isActive ? '' : ' <span class="muted">(inactive)</span>'}</td>
      <td>${payLabel(b.payType)}</td>
      <td class="num ${b.remaining > 0 ? 'neg' : ''}">${formatNpr(b.remaining)}</td>
      <td class="num">${b.advance > 0 ? formatNpr(b.advance) : '—'}</td>
      <td>${b.nextSalaryDate ? esc(b.nextSalaryDate) : '—'}</td>
    </tr>`)
    .join('');
  tbody.querySelectorAll<HTMLTableRowElement>('.py-row').forEach((r) =>
    r.addEventListener('click', () => void openStaff(Number(r.dataset.id))),
  );
}

// ---- Incentives ------------------------------------------------------

const g = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

let incentiveRows: IncentiveRow[] = [];

function incentiveMonth(): string {
  const el = g<HTMLInputElement>('in-month');
  if (!el.value) el.value = new Date().toISOString().slice(0, 7);
  return el.value;
}

function ruleFor(r: IncentiveRule): string {
  return r.staffName || r.positionName || 'Everyone';
}

function ruleRate(r: IncentiveRule): string {
  return r.basis.endsWith('percent') ? `${r.value}%` : formatNpr(r.value);
}

async function loadIncentives(): Promise<void> {
  const owner = canSetup;
  g('ir-form').hidden = !owner;
  const err = g('ir-error');
  err.hidden = true;
  try {
    const [rules, rows] = await Promise.all([listIncentiveRules(), getIncentives(incentiveMonth())]);
    incentiveRows = rows;
    if (owner && !g('ir-basis').childElementCount) {
      g('ir-basis').innerHTML = (Object.keys(INCENTIVE_BASIS_LABEL) as IncentiveBasis[]).map((b) => `<option value="${b}">${esc(INCENTIVE_BASIS_LABEL[b])}</option>`).join('');
      const [people, positions] = await Promise.all([listStaff().catch(() => [] as StaffMember[]), listPositions().catch(() => [])]);
      g('ir-target').innerHTML = '<option value="">Everyone</option>'
        + positions.map((p) => `<option value="p:${p.id}">Position: ${esc(p.name)}</option>`).join('')
        + people.filter((m) => m.isActive).map((m) => `<option value="s:${m.id}">${esc(m.name || m.username)}</option>`).join('');
    }
    g('ir-rules').innerHTML = rules.length
      ? rules.map((r) => `<tr><td>${esc(r.name)}${r.isActive ? '' : ' <span class="py-hint">(off)</span>'}</td><td>${esc(INCENTIVE_BASIS_LABEL[r.basis])}</td><td class="num">${ruleRate(r)}</td><td>${esc(ruleFor(r))}</td><td>${owner ? `<button class="btn-link" data-ir-toggle="${r.id}" data-on="${r.isActive ? 1 : 0}">${r.isActive ? 'Turn off' : 'Turn on'}</button> <button class="btn-link is-danger" data-ir-del="${r.id}">Delete</button>` : ''}</td></tr>`).join('')
      : '<tr><td colspan="5" class="py-hint">No rules yet.</td></tr>';
    const total = rows.reduce((t, r) => t + r.total, 0);
    g('in-sum').textContent = `${rows.length} ${rows.length === 1 ? 'person' : 'people'} · ${formatNpr(total)}`;
    g('in-rows').innerHTML = rows.length
      ? rows.map((r) => {
          const status = r.entryId ? `Added to pay (${formatNpr(r.appliedAmount ?? 0)})` : r.hasPayProfile ? 'Not added yet' : 'No salary set up';
          const act = canPay && !r.entryId && r.hasPayProfile && r.total > 0 ? `<button class="btn-ghost-sm" data-in-apply="${r.staffId}">Add to pay</button>` : '';
          const parts = r.lines.map((l) => `${esc(l.name)}: ${formatNpr(l.amount)}`).join('<br>') || '—';
          return `<tr><td>${esc(r.name)}</td><td>${parts}</td><td class="num"><strong>${formatNpr(r.total)}</strong></td><td>${status}</td><td>${act}</td></tr>`;
        }).join('')
      : '<tr><td colspan="5" class="py-hint">Nobody earned an incentive this month.</td></tr>';
    g('in-apply-all').hidden = !(canPay && rows.some((r) => !r.entryId && r.hasPayProfile && r.total > 0));
  } catch (error) {
    err.textContent = describe(error);
    err.hidden = false;
  }
}

g('in-refresh').addEventListener('click', () => void loadIncentives());
g('in-month').addEventListener('change', () => void loadIncentives());

async function runApply(ids?: number[]): Promise<void> {
  try {
    const r = await applyIncentives(incentiveMonth(), ids);
    const noProfile = r.skipped.filter((s) => s.reason === 'no_pay_profile').length;
    if (noProfile) g('in-error').textContent = `${noProfile} not added: no salary set up.`;
    g('in-error').hidden = !noProfile;
    await loadIncentives();
  } catch (error) {
    g('in-error').textContent = describe(error);
    g('in-error').hidden = false;
  }
}

g('in-apply-all').addEventListener('click', () => {
  if (confirm('Add every listed incentive to pay as a bonus for this month?')) void runApply();
});
g('in-rows').addEventListener('click', (e) => {
  const id = Number((e.target as HTMLElement).closest<HTMLElement>('[data-in-apply]')?.dataset.inApply);
  if (id) void runApply([id]);
});

g('ir-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const target = val('ir-target');
  try {
    await saveIncentiveRule({
      name: val('ir-name'),
      basis: val('ir-basis') as IncentiveBasis,
      value: Number(val('ir-value')),
      staffId: target.startsWith('s:') ? Number(target.slice(2)) : null,
      positionId: target.startsWith('p:') ? Number(target.slice(2)) : null,
    });
    (g('ir-form') as HTMLFormElement).reset();
    await loadIncentives();
  } catch (error) {
    g('ir-error').textContent = describe(error);
    g('ir-error').hidden = false;
  }
});
g('ir-rules').addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  const toggle = t.closest<HTMLElement>('[data-ir-toggle]');
  const del = t.closest<HTMLElement>('[data-ir-del]');
  try {
    if (toggle) {
      const r = (await listIncentiveRules()).find((x) => x.id === Number(toggle.dataset.irToggle));
      if (r) await saveIncentiveRule({ ...r, isActive: toggle.dataset.on !== '1' });
    } else if (del && confirm('Delete this rule? Bonuses already added to pay stay.')) {
      await deleteIncentiveRule(Number(del.dataset.irDel));
    } else return;
    await loadIncentives();
  } catch (error) {
    g('ir-error').textContent = describe(error);
    g('ir-error').hidden = false;
  }
});

async function loadPayroll(): Promise<void> {
  const mine = ++token;
  try {
    const [b, s, st] = await Promise.all([listBalances(val('pr-search').trim()), listSalaries(), listStaff().catch(() => [] as StaffMember[])]);
    if (mine !== token) return;
    balances = b;
    salaries = s;
    staff = st;
    notice(canWrite ? null : 'Read-only: you are viewing this branch from Head Office.');
  } catch (error) {
    if (mine !== token) return;
    balances = [];
    notice(describe(error), true);
  }
  renderPayrollKpis();
  renderSetup();
  renderBalances();
  if (selectedId) void openStaff(selectedId);
}

async function openStaff(id: number): Promise<void> {
  selectedId = id;
  renderBalances();
  const el = $('pr-detail')!;
  try {
    const [{ balance: b, unsettled }, statement] = await Promise.all([getBalance(id), listStatement(id)]);
    const profile = salaries.find((s) => s.staffId === id);
    const acts: string[] = [];
    if (canPay) {
      acts.push(`<button class="btn-primary-sm" data-act="pay">Pay</button>`);
      acts.push(`<button class="btn-ghost-sm" data-act="entry">${b.payType === 'daily' ? 'Add wage / bonus' : 'Add bonus / deduction'}</button>`);
    }
    if (canSetup) acts.push(`<button class="btn-ghost-sm" data-act="setup">Pay setup</button>`);
    el.innerHTML = `
      <div class="py-detail-head">
        <h3>${esc(b.name)}</h3>
        <p class="muted small">${payLabel(b.payType)}${profile && b.payType === 'monthly' ? ` · ${formatNpr(profile.rate)}${profile.allowances ? ` + ${formatNpr(profile.allowances)} allowances` : ''} · due on day ${profile.salaryDay}` : ''}</p>
      </div>
      <div class="py-detail-actions">${acts.join('')}</div>
      <div class="py-mini-kpis">
        <div><span>Owed now</span><strong class="${b.remaining > 0 ? 'neg' : ''}">${formatNpr(b.remaining)}</strong></div>
        <div><span>Advance</span><strong>${formatNpr(b.advance)}</strong></div>
        <div><span>Earned</span><strong>${formatNpr(b.totalEarned)}</strong></div>
        <div><span>Paid</span><strong>${formatNpr(b.totalPaid)}</strong></div>
      </div>
      ${b.previousRemaining > 0 ? `<p class="py-note is-warn">${formatNpr(b.previousRemaining)} is carried over from earlier periods.</p>` : ''}
      ${unsettled.length ? `<h4>Not paid yet</h4>
        <ul class="py-list">${unsettled.map((u) => `<li><span>${esc(u.date)} · ${esc(pretty(u.kind))}${u.carriedOver ? ' · earlier' : ''}${u.description ? ` · ${esc(u.description)}` : ''}</span><strong>${formatNpr(u.remaining)}</strong></li>`).join('')}</ul>` : ''}
      <h4>Statement</h4>
      ${statement.length === 0 ? `<p class="muted small">Nothing yet.</p>` : `
      <div class="py-table-wrap"><table class="py-table py-mini">
        <thead><tr><th>Date</th><th>What</th><th class="num">Amount</th><th class="num">Owed after</th><th></th></tr></thead>
        <tbody>${statement.slice(0, 60).map((s) => {
          const sign = s.direction === 'paid' ? '−' : s.direction === 'deducted' ? '−' : '+';
          const what = s.type === 'payment'
            ? `Paid${s.method ? ` (${esc(METHOD_LABEL[s.method as PayMethod] ?? s.method)})` : ''}${s.advancePart > 0 ? ` · advance ${formatNpr(s.advancePart)}` : ''}`
            : esc(pretty(s.type));
          const note = [s.description, s.reference ? `Ref ${s.reference}` : ''].filter(Boolean).map(esc).join(' · ');
          return `<tr><td>${esc(s.date)}</td><td>${what}${note ? `<br /><span class="muted">${note}</span>` : ''}</td>
            <td class="num">${sign}${formatNpr(s.amount)}</td>
            <td class="num">${s.advanceAfter > 0 ? `<span class="muted">adv ${formatNpr(s.advanceAfter)}</span>` : formatNpr(s.owedAfter)}</td>
            <td>${canPay ? `<button class="btn-link is-danger" data-void-${s.type === 'payment' ? 'pay' : 'entry'}="${s.id}">Void</button>` : ''}</td></tr>`;
        }).join('')}</tbody></table></div>
      ${statement.length > 60 ? `<p class="muted small">Showing the latest 60 of ${statement.length}.</p>` : ''}`}`;

    el.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((x) =>
      x.addEventListener('click', () => {
        if (x.dataset.act === 'pay') openPay(b);
        else if (x.dataset.act === 'entry') openEntry(b);
        else openSalary(id);
      }),
    );
    el.querySelectorAll<HTMLButtonElement>('[data-void-pay]').forEach((x) =>
      x.addEventListener('click', () =>
        askReason('Void payment', 'The amount goes back onto what is owed.', async (reason) => {
          await voidPayrollPayment(Number(x.dataset.voidPay), reason);
        }),
      ),
    );
    el.querySelectorAll<HTMLButtonElement>('[data-void-entry]').forEach((x) =>
      x.addEventListener('click', () =>
        askReason('Void entry', 'It stops counting as earned or deducted.', async (reason) => {
          await voidEntry(Number(x.dataset.voidEntry), reason);
        }),
      ),
    );
  } catch (error) {
    el.innerHTML = `<p class="py-empty-detail">${esc(describe(error))}</p>`;
  }
}

function openSalary(staffId: number): void {
  const person = staff.find((s) => s.id === staffId);
  const profile = salaries.find((s) => s.staffId === staffId);
  $('sl-sub')!.textContent = person ? person.name || person.username : '';
  $('form-salary')!.dataset.id = String(staffId);
  $<HTMLSelectElement>('sl-type')!.value = profile?.payType ?? 'monthly';
  $<HTMLInputElement>('sl-rate')!.value = String(profile?.rate ?? 0);
  $<HTMLInputElement>('sl-allow')!.value = String(profile?.allowances ?? 0);
  $<HTMLInputElement>('sl-day')!.value = String(profile?.salaryDay ?? 1);
  $<HTMLInputElement>('sl-start')!.value = profile?.startDate ?? today();
  // The start date is fixed once pay is set up.
  $('sl-start-wrap')!.hidden = Boolean(profile);
  $('sl-note')!.textContent = profile
    ? 'Changing the pay applies to future months only. Switching between monthly and daily starts the new type from today.'
    : 'Monthly salary is recorded by the system on the salary day. For daily wage, mark each day on the Daily sheet; the wage is worked out from the daily rate.';
  syncSalaryType();
  showError('sl-error', null);
  dlg('dlg-salary').showModal();
}

function syncSalaryType(): void {
  const monthly = val('sl-type') === 'monthly';
  document.querySelectorAll<HTMLElement>('[data-monthly]').forEach((el) => (el.hidden = !monthly));
  $('sl-rate-label')!.textContent = monthly ? 'Monthly salary *' : 'Daily wage for a full day (optional)';
}
$('sl-type')?.addEventListener('change', syncSalaryType);

$('form-salary')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = Number($('form-salary')!.dataset.id);
  const hasProfile = salaries.some((s) => s.staffId === id);
  void submit('sl-save', 'sl-error', 'dlg-salary', async () => {
    await saveSalary(id, {
      payType: val('sl-type') as PayType,
      rate: Number(val('sl-rate')) || 0,
      allowances: Number(val('sl-allow')) || 0,
      salaryDay: Number(val('sl-day')) || 1,
      startDate: hasProfile ? undefined : val('sl-start'),
    });
    selectedId = id;
    await refresh();
  });
});

function openPay(b: PayBalance): void {
  $('pp-sub')!.textContent = `${b.name} · owed now ${formatNpr(b.remaining)}${b.advance > 0 ? ` · advance ${formatNpr(b.advance)}` : ''}`;
  $('form-pay')!.dataset.id = String(b.staffId);
  $<HTMLInputElement>('pp-amount')!.value = b.remaining > 0 ? String(b.remaining) : '';
  $<HTMLSelectElement>('pp-method')!.value = 'cash';
  $<HTMLInputElement>('pp-date')!.value = today();
  $<HTMLInputElement>('pp-date')!.max = today();
  $<HTMLInputElement>('pp-ref')!.value = '';
  showError('pp-error', null);
  dlg('dlg-pay').showModal();
}

$('form-pay')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = Number($('form-pay')!.dataset.id);
  void submit('pp-save', 'pp-error', 'dlg-pay', async () => {
    await addPayrollPayment({
      staffId: id,
      amount: Number(val('pp-amount')),
      method: val('pp-method') as PayMethod,
      paidOn: val('pp-date'),
      reference: val('pp-ref'),
    });
    await refresh();
  });
});

function openEntry(b: PayBalance): void {
  $('en-sub')!.textContent = b.name;
  $('form-entry')!.dataset.id = String(b.staffId);
  const kinds: [EntryKind, string][] =
    b.payType === 'daily'
      ? [['wage', 'Daily wage'], ['bonus', 'Bonus'], ['deduction', 'Deduction']]
      : [['bonus', 'Bonus'], ['deduction', 'Deduction']];
  $<HTMLSelectElement>('en-kind')!.innerHTML = kinds.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  $<HTMLInputElement>('en-date')!.value = today();
  $<HTMLInputElement>('en-amount')!.value = '';
  $<HTMLInputElement>('en-desc')!.value = '';
  showError('en-error', null);
  dlg('dlg-entry').showModal();
}

$('form-entry')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = Number($('form-entry')!.dataset.id);
  void submit('en-save', 'en-error', 'dlg-entry', async () => {
    await addEntry({
      staffId: id,
      kind: val('en-kind') as EntryKind,
      date: val('en-date'),
      amount: Number(val('en-amount')),
      description: val('en-desc'),
    });
    await refresh();
  });
});

// ---- Daily sheet -----------------------------------------------------

let sheet: WorkRow[] = [];
const todayIso = (): string => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const shiftDay = (iso: string, by: number): string => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + by);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const STATES: [WorkStatus, string][] = [['present', 'Present'], ['half', 'Half'], ['absent', 'Absent']];

// `typed` is the day's wage entered by hand; empty uses the usual rate.
function dayPay(r: WorkRow, status: WorkStatus | null, extra: number, typed = 0): number {
  if (!status || status === 'absent') return 0;
  return (typed > 0 ? typed : r.rate * (status === 'half' ? 0.5 : 1)) + extra;
}

/** What was typed on a marked day: the saved wage when it differs from the usual rate. */
function typedWage(r: WorkRow): string {
  if (!r.status || r.status === 'absent') return '';
  const usual = r.rate * (r.status === 'half' ? 0.5 : 1);
  const saved = r.amount - r.extra;
  return Math.abs(saved - usual) > 0.004 ? String(saved) : '';
}

function showDaily(): void {
  const body = $('ds-tbody');
  if (!sheet.length) {
    body.innerHTML = '<tr><td colspan="8" class="py-empty">Nobody is on daily pay. Set someone\'s pay to "Daily wage" on the Staff pay tab.</td></tr>';
    $('ds-sum').textContent = '';
    return;
  }
  body.innerHTML = sheet.map((r) => `<tr data-staff="${r.staffId}">
    <td><strong>${esc(r.name)}</strong></td>
    <td class="num">${formatNpr(r.rate)}</td>
    <td><div class="py-seg" role="group">${STATES.map(([v, l]) => `<button type="button" class="py-seg-btn${r.status === v ? ' is-on' : ''}" data-set="${v}">${l}</button>`).join('')}</div></td>
    <td class="num"><input type="number" class="ds-amt" min="0" step="0.01" value="${typedWage(r)}" placeholder="${r.rate ? 'Usual' : 'Amount'}" style="width:92px" /></td>
    <td class="num"><input type="number" class="ds-extra" min="0" step="0.01" value="${r.extra || ''}" placeholder="0" style="width:84px" /></td>
    <td><input type="text" class="ds-note" maxlength="150" value="${esc(r.note)}" placeholder="Note" /></td>
    <td class="num ds-pay">${formatNpr(dayPay(r, r.status, r.extra))}</td>
    <td class="py-hint">${r.month.present} present · ${r.month.half} half · ${r.month.absent} absent<br />${formatNpr(r.month.earned)} earned</td>
  </tr>`).join('');
  updateDailySum();
}

function updateDailySum(): void {
  const rows = [...document.querySelectorAll<HTMLElement>('#ds-tbody tr[data-staff]')];
  let total = 0;
  let marked = 0;
  for (const tr of rows) {
    const r = sheet.find((x) => x.staffId === Number(tr.dataset.staff))!;
    const status = (tr.querySelector<HTMLElement>('.is-on')?.dataset.set ?? null) as WorkStatus | null;
    const extra = Number(tr.querySelector<HTMLInputElement>('.ds-extra')!.value) || 0;
    const typed = Number(tr.querySelector<HTMLInputElement>('.ds-amt')!.value) || 0;
    const pay = dayPay(r, status, extra, typed);
    tr.querySelector('.ds-pay')!.textContent = formatNpr(pay);
    total += pay;
    if (status) marked += 1;
  }
  $('ds-sum').textContent = `${marked} of ${rows.length} marked · ${formatNpr(total)} for the day`;
}

async function loadDaily(): Promise<void> {
  const input = $<HTMLInputElement>('ds-date')!;
  if (!input.value) input.value = todayIso();
  input.max = todayIso();
  ($('ds-next') as HTMLButtonElement).disabled = input.value >= todayIso();
  $('ds-error').hidden = true;
  try {
    sheet = await getWorkSheet(input.value);
    showDaily();
  } catch (e) {
    $('ds-tbody').innerHTML = `<tr><td colspan="8" class="py-empty">${esc(e instanceof Error ? e.message : 'Could not load the sheet.')}</td></tr>`;
  }
}

$('ds-tbody').addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-set]');
  if (!btn) return;
  btn.parentElement!.querySelectorAll('.is-on').forEach((b) => b.classList.remove('is-on'));
  btn.classList.add('is-on');
  updateDailySum();
});
$('ds-tbody').addEventListener('input', () => updateDailySum());
$('ds-all').addEventListener('click', () => {
  document.querySelectorAll('#ds-tbody tr[data-staff]').forEach((tr) => {
    tr.querySelectorAll('.is-on').forEach((b) => b.classList.remove('is-on'));
    tr.querySelector('[data-set="present"]')?.classList.add('is-on');
  });
  updateDailySum();
});
for (const [id, by] of [['ds-prev', -1], ['ds-next', 1]] as const) {
  $(id).addEventListener('click', () => {
    const input = $<HTMLInputElement>('ds-date')!;
    input.value = shiftDay(input.value || todayIso(), by);
    void loadDaily();
  });
}
$('ds-date').addEventListener('change', () => void loadDaily());
$('ds-save').addEventListener('click', async () => {
  const marks = [...document.querySelectorAll<HTMLElement>('#ds-tbody tr[data-staff]')]
    .map((tr) => ({
      staff: Number(tr.dataset.staff),
      status: tr.querySelector<HTMLElement>('.is-on')?.dataset.set as WorkStatus | undefined,
      extra: Number(tr.querySelector<HTMLInputElement>('.ds-extra')!.value) || 0,
      amount: Number(tr.querySelector<HTMLInputElement>('.ds-amt')!.value) || 0,
      note: tr.querySelector<HTMLInputElement>('.ds-note')!.value.trim(),
    }))
    .filter((m): m is { staff: number; status: WorkStatus; extra: number; amount: number; note: string } => Boolean(m.status));
  const err = $('ds-error');
  err.hidden = true;
  if (!marks.length) {
    err.textContent = 'Mark at least one person first.';
    err.hidden = false;
    return;
  }
  const button = $<HTMLButtonElement>('ds-save')!;
  button.disabled = true;
  try {
    sheet = await saveWorkSheet($<HTMLInputElement>('ds-date')!.value, marks);
    showDaily();
    notice(`Saved ${marks.length} ${marks.length === 1 ? 'person' : 'people'} for ${$<HTMLInputElement>('ds-date')!.value}.`);
  } catch (e) {
    err.textContent = e instanceof Error && e.message ? e.message : 'Could not save. Please try again.';
    err.hidden = false;
  } finally {
    button.disabled = false;
  }
});

// ---- Cash and bank ------------------------------------------------------

let cashRows: MethodBalance[] = [];
const cashDate = () => $<HTMLInputElement>('cb-date')!;

async function loadCash(): Promise<void> {
  if (!cashDate().value) cashDate().value = today();
  const body = $('cb-rows')!;
  try {
    const [b, checks] = await Promise.all([getBalances(cashDate().value), listChecks()]);
    cashRows = b.methods;
    body.innerHTML = b.methods
      .map((m) => {
        const last = m.lastCheck;
        const lastText = last
          ? `${esc(last.asOf)}: ${last.difference === 0 ? 'matched' : `${last.difference > 0 ? 'over' : 'short'} ${esc(formatNpr(Math.abs(last.difference)))}`}${last.adjusted ? ' (adjusted)' : ''}`
          : 'Never';
        const open = m.openingAsOf ? `${esc(formatNpr(m.opening))}<br><small>at ${esc(m.openingAsOf)}</small>` : '<small>not set</small>';
        return `<tr><td>${esc(m.label)}</td><td class="num">${open}</td><td class="num">${esc(formatNpr(m.received))}</td><td class="num">${esc(formatNpr(m.paid))}</td><td class="num"><strong>${esc(formatNpr(m.expected))}</strong></td><td>${lastText}</td><td class="num">${canWrite ? `<button type="button" class="btn-ghost-sm" data-cb-open="${m.method}">Opening</button> <button type="button" class="btn-primary-sm" data-cb-check="${m.method}">Check</button>` : ''}</td></tr>`;
      })
      .join('');
    $('cb-hint')!.textContent = b.withoutMethod
      ? `${b.withoutMethod} entr${b.withoutMethod === 1 ? 'y has' : 'ies have'} no payment method, so they are in none of these balances.`
      : '';
    $('cb-history')!.innerHTML = checks.length
      ? checks
          .map((c) => `<tr><td>${esc(c.asOf)}</td><td>${esc(pretty(c.method))}</td><td class="num">${esc(formatNpr(c.expected))}</td><td class="num">${esc(formatNpr(c.counted))}</td><td class="num">${c.difference === 0 ? 'Matched' : esc(formatNpr(c.difference))}${c.adjusted ? ' <small>adjusted</small>' : ''}</td><td>${esc(c.note) || '—'}</td><td>${esc(c.createdBy)}</td></tr>`)
          .join('')
      : '<tr><td colspan="7" class="py-empty">No checks yet.</td></tr>';
  } catch (e) {
    body.innerHTML = `<tr><td colspan="7" class="py-empty">${esc(e instanceof Error ? e.message : 'Could not load.')}</td></tr>`;
  }
}

cashDate().addEventListener('change', () => void loadCash());

let cashMethod: PayMethod = 'cash';

$('cb-rows')?.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const open = t.closest<HTMLElement>('[data-cb-open]');
  const check = t.closest<HTMLElement>('[data-cb-check]');
  if (open) {
    cashMethod = open.dataset.cbOpen as PayMethod;
    const row = cashRows.find((r) => r.method === cashMethod)!;
    $('ob-title')!.textContent = `${row.label}: opening balance`;
    $<HTMLInputElement>('ob-date')!.value = row.openingAsOf ?? today();
    $<HTMLInputElement>('ob-date')!.max = today();
    $<HTMLInputElement>('ob-amount')!.value = row.openingAsOf ? String(row.opening) : '';
    showError('ob-error', null);
    dlg('dlg-open-bal').showModal();
  } else if (check) {
    cashMethod = check.dataset.cbCheck as PayMethod;
    const row = cashRows.find((r) => r.method === cashMethod)!;
    $('ck-title')!.textContent = `Check ${row.label.toLowerCase()}`;
    $('ck-expected')!.textContent = `The books say ${formatNpr(row.expected)} as at ${cashDate().value}.`;
    $<HTMLInputElement>('ck-date')!.value = cashDate().value;
    $<HTMLInputElement>('ck-date')!.max = today();
    $<HTMLInputElement>('ck-counted')!.value = '';
    $<HTMLInputElement>('ck-note')!.value = '';
    $<HTMLInputElement>('ck-adjust')!.checked = false;
    showError('ck-error', null);
    dlg('dlg-check').showModal();
  }
});

$('form-open-bal')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await setOpeningBalance(cashMethod, Number(val('ob-amount')), val('ob-date'));
    dlg('dlg-open-bal').close();
    await loadCash();
  } catch (err) {
    showError('ob-error', err instanceof Error ? err.message : 'Could not save.');
  }
});

$('form-check')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await saveCheck({
      method: cashMethod,
      asOf: val('ck-date'),
      counted: Number(val('ck-counted')),
      note: val('ck-note'),
      adjust: $<HTMLInputElement>('ck-adjust')!.checked,
    });
    dlg('dlg-check').close();
    notice(r.difference === 0 ? 'Matched: the books and the count agree.' : `Saved. Difference: ${formatNpr(r.difference)}${r.adjusted ? ' (recorded in the books)' : ''}.`);
    await loadCash();
  } catch (err) {
    showError('ck-error', err instanceof Error ? err.message : 'Could not save.');
  }
});

// ---- Tabs and load ---------------------------------------------------

function syncTab(): void {
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('is-active', (b as HTMLElement).dataset.tab === tab));
  document.querySelectorAll('[data-panel]').forEach((p) => p.classList.remove('is-active'));
  document.querySelector(`[data-panel="${tab === 'payroll' || tab === 'daily' || tab === 'incentives' || tab === 'cash' ? tab : 'ledger'}"]`)?.classList.add('is-active');
  const add = $<HTMLButtonElement>('py-add')!;
  add.hidden = !canWrite || tab === 'payroll' || tab === 'daily' || tab === 'incentives' || tab === 'cash';
  add.textContent = tab === 'income' ? '+ Add income' : '+ Add expense';
}

async function refresh(): Promise<void> {
  syncTab();
  if (tab === 'cash') await loadCash();
  else if (tab === 'daily') await loadDaily();
  else if (tab === 'incentives') await loadIncentives();
  else if (tab === 'payroll') await loadPayroll();
  else await loadLedger();
}

document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
  b.addEventListener('click', () => {
    tab = b.dataset.tab as Tab;
    if (tab === 'expenses' || tab === 'income') fillCategoryFilter();
    void refresh();
  }),
);

for (const id of ['lg-category', 'lg-status', 'lg-from', 'lg-to']) $(id)?.addEventListener('change', () => void loadLedger());
let timer: number | undefined;
$('pr-search')?.addEventListener('input', () => {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void loadPayroll(), 300);
});
$('py-add')?.addEventListener('click', () => openLedger());
$('py-refresh')?.addEventListener('click', () => void refresh());
document.getElementById('branch-select')?.addEventListener('change', () => setTimeout(() => { selectedId = null; void init(); }, 300));

function init(): void {
  const s = getSession();
  if (s) $('py-scope')!.textContent = `${s.activeBranchName} (${s.activeBranchCode})`;
  canWrite = s?.accessMode !== 'read_only';
  canPay = canWrite && can(s, 'staff.pay');
  canSetup = canWrite && !!s?.isOwner;
  const dsSave = $<HTMLButtonElement>('ds-save');
  if (dsSave) dsSave.hidden = !canPay;
  fillCategoryFilter();
  void refresh();
}

init();
