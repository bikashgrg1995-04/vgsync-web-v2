import { getSession, canManageStaff, refreshProfile } from '../../lib/auth';
import { api, ApiError } from '../../lib/api';
import { paintAvatar } from '../../lib/avatar';
import {
  getAccess,
  getStaff,
  listPositions,
  loadCatalogue,
  ROLE_LABEL,
  saveOverrides,
  type CatalogueModule,
  type OverrideEffect,
  type Position,
  type StaffAccess,
  type StaffMember,
  type StaffDocument,
  DOCUMENT_CATEGORIES,
  listDocuments,
  uploadDocument,
  downloadDocument,
  deleteDocument,
  positionLabel,
} from '../../lib/staff';
import {
  getAttendance,
  getBalance,
  listSalaries,
  listStatement,
  formatNpr,
  type PayBalance,
  type SalaryProfile,
  type StatementRow,
} from '../../lib/payments';

const session = getSession();
if (!session) window.location.replace('/');
else if (!canManageStaff(session)) window.location.replace('/dashboard');

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const text = (id: string, v: string) => {
  const el = $(id);
  if (el) el.textContent = v || '—';
};
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const date = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Never';

let currentMember: StaffMember | null = null;
const staffId = Number(new URLSearchParams(window.location.search).get('id'));

// ---------- tabs ----------
function showTab(name: string): void {
  document.querySelectorAll<HTMLElement>('.sd-panel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === name));
  document.querySelectorAll<HTMLButtonElement>('#sd-nav button[data-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
}
document.querySelectorAll<HTMLButtonElement>('#sd-nav button[data-tab]').forEach((b) =>
  b.addEventListener('click', () => showTab(b.dataset.tab!)),
);
document.querySelectorAll<HTMLElement>('[data-goto]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.goto!)));

function fail(message: string): void {
  const el = $('sd-error');
  if (!el) return;
  el.hidden = false;
  el.textContent = message;
}

// ---------- attendance ----------
const STATUS_LABEL: Record<string, string> = { present: 'Present', half: 'Half day', absent: 'Absent' };
const monthInput = $<HTMLInputElement>('sd-att-month');
if (monthInput) {
  const now = new Date();
  monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  monthInput.addEventListener('change', () => void loadAttendance());
}

async function loadAttendance(): Promise<void> {
  const body = $('sd-att-rows');
  const kpis = $('sd-att-kpis');
  if (!body || !kpis || !monthInput?.value) return;
  try {
    const a = await getAttendance(staffId, monthInput.value);
    kpis.innerHTML = [
      ['Present', String(a.present)],
      ['Half days', String(a.half)],
      ['Absent', String(a.absent)],
      ['Earned', formatNpr(a.earned)],
    ].map(([k, v]) => `<div class="sd-kpi"><small>${k}</small><strong>${esc(v)}</strong></div>`).join('');
    body.innerHTML = a.days.length
      ? a.days.map((d) => `<tr><td>${esc(date(d.date))}</td><td>${esc(STATUS_LABEL[d.status] ?? d.status)}</td><td>${esc(d.note) || '—'}</td><td class="num">${d.extra ? esc(formatNpr(d.extra)) : '—'}</td><td class="num">${d.status === 'absent' ? '—' : esc(formatNpr(d.amount))}</td></tr>`).join('')
      : '<tr><td colspan="5" class="sd-empty">No attendance marked this month.</td></tr>';
  } catch (error) {
    body.innerHTML = `<tr><td colspan="5" class="sd-empty">${esc(error instanceof ApiError ? error.message : 'Could not load attendance.')}</td></tr>`;
  }
}

// ---------- documents ----------
let docs: StaffDocument[] = [];
const docError = (message: string) => {
  const el = $('sd-doc-error');
  if (!el) return;
  el.hidden = !message;
  el.textContent = message;
};
const sizeText = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function renderDocuments(): void {
  const body = $('sd-docs');
  if (!body) return;
  const canEdit = getSession()?.accessMode !== 'read_only';
  body.innerHTML = docs.length
    ? docs.map((d) => `<tr><td>${esc(d.title)}</td><td>${esc(DOCUMENT_CATEGORIES[d.category] ?? d.category)}</td><td>${esc(d.fileName)}</td><td>${esc(date(d.createdAt))}</td><td class="num">${sizeText(d.size)}</td><td class="num"><button type="button" class="sd-link" data-doc-get="${d.id}">Download</button>${canEdit ? ` <button type="button" class="sd-link" data-doc-del="${d.id}">Delete</button>` : ''}</td></tr>`).join('')
    : '<tr><td colspan="6" class="sd-empty">No documents yet.</td></tr>';
}

async function loadDocuments(): Promise<void> {
  try {
    docs = await listDocuments(staffId);
    renderDocuments();
  } catch (error) {
    docError(error instanceof ApiError ? error.message : 'Could not load documents.');
  }
}

if (getSession()?.accessMode !== 'read_only') $('sd-doc-form')?.removeAttribute('hidden');

$<HTMLFormElement>('sd-doc-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>('sd-doc-file');
  const file = input?.files?.[0];
  if (!file) return;
  const button = $<HTMLButtonElement>('sd-doc-upload')!;
  button.disabled = true;
  docError('');
  try {
    await uploadDocument(
      staffId,
      file,
      $<HTMLInputElement>('sd-doc-title')!.value,
      $<HTMLSelectElement>('sd-doc-category')!.value as StaffDocument['category'],
    );
    $<HTMLFormElement>('sd-doc-form')!.reset();
    await loadDocuments();
  } catch (error) {
    docError(error instanceof ApiError ? error.message : 'Could not upload the file.');
  } finally {
    button.disabled = false;
  }
});

$('sd-docs')?.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  const get = t.closest<HTMLElement>('[data-doc-get]');
  const del = t.closest<HTMLElement>('[data-doc-del]');
  docError('');
  try {
    if (get) {
      const d = docs.find((x) => x.id === Number(get.dataset.docGet));
      if (d) await downloadDocument(staffId, d);
    } else if (del) {
      const d = docs.find((x) => x.id === Number(del.dataset.docDel));
      if (d && confirm(`Delete "${d.title}"? This cannot be undone.`)) {
        await deleteDocument(staffId, d.id);
        await loadDocuments();
      }
    }
  } catch (error) {
    docError(error instanceof ApiError ? error.message : 'That did not work.');
  }
});

// ---------- profile ----------
function renderStaff(m: StaffMember): void {
  const s = getSession();
  const branch = s?.activeBranchName ?? '';
  paintAvatar($('sd-avatar'), String(m.id), m.name);
  text('sd-name', m.name);
  text('sd-username', m.username);
  const status = $('sd-status');
  if (status) {
    status.textContent = m.isActive ? (m.mustChangePassword ? 'Password pending' : 'Active') : 'Inactive';
    status.className = `sd-pill ${m.isActive ? (m.mustChangePassword ? 'is-pending' : 'is-active') : 'is-inactive'}`;
  }
  text('sd-f-position', positionLabel(m) || ROLE_LABEL[m.role]);
  text('sd-f-branch', branch);
  text('sd-f-phone', m.phone);
  text('sd-f-email', m.email);
  text('sd-t-joined', date(m.dateJoined));
  text('sd-t-role', ROLE_LABEL[m.role] ?? m.role);
  text('sd-t-position', positionLabel(m) || '—');
  text('sd-t-branch', branch);
  text('sd-k-name', m.name);
  text('sd-k-username', m.username);
  text('sd-k-email', m.email);
  text('sd-k-phone', m.phone);
  text('sd-k-login', dateTime(m.lastLogin));
  text('sd-k-password', m.mustChangePassword ? 'Must be changed at next sign-in' : 'Set by the user');
  document.title = `VGSync | ${m.name}`;
  const edit = $<HTMLAnchorElement>('sd-edit');
  if (edit && getSession()?.accessMode !== 'read_only' && getSession()?.isOwner) {
    edit.href = `/staff?edit=${m.id}`;
    edit.hidden = false;
  }
}

// ---------- salary ----------
function renderSalary(profile: SalaryProfile | null, bal: PayBalance | null): void {
  const box = $('sd-salary-box');
  const type = $('sd-pay-type');
  if (!box) return;
  if (!profile) {
    box.innerHTML = '<p class="sd-hint">No salary has been set up for this person yet. Set it in Payments.</p>';
    if (type) type.hidden = true;
    return;
  }
  if (type) {
    type.hidden = false;
    type.textContent = profile.payType === 'monthly' ? 'Monthly' : 'Daily wage';
  }
  const remaining = bal ? formatNpr(bal.remaining) : '—';
  if (profile.payType === 'monthly') {
    box.innerHTML = `<div class="sd-pay">
      <div class="sd-pay-hero"><strong>${esc(formatNpr(profile.rate + profile.allowances))}</strong><small>Monthly salary</small></div>
      <dl class="sd-kv">
        <div><dt>Basic Salary</dt><dd>${esc(formatNpr(profile.rate))}</dd></div>
        <div><dt>Allowances</dt><dd>${esc(formatNpr(profile.allowances))}</dd></div>
        <div><dt>Salary day</dt><dd>${profile.salaryDay}</dd></div>
        <div><dt>Next salary</dt><dd>${esc(date(bal?.nextSalaryDate))}</dd></div>
      </dl></div>
      <div class="sd-net"><span>Still to pay</span><span>${esc(remaining)}</span></div>`;
  } else {
    box.innerHTML = `<p class="sd-hint" style="margin-bottom:8px">Paid per day worked. Each day's amount is entered as it happens.</p>
      <div class="sd-net"><span>Still to pay</span><span>${esc(remaining)}</span></div>`;
  }
}

function rowPill(r: StatementRow): string {
  if (r.direction === 'paid') return '<span class="sd-pill is-paid">Paid</span>';
  if (r.direction === 'deducted') return '<span class="sd-pill is-deducted">Deducted</span>';
  return '<span class="sd-pill is-earned">Earned</span>';
}
const typeLabel = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function renderStatement(rows: StatementRow[], bal: PayBalance | null): void {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
  const recent = $('sd-recent');
  if (recent) {
    recent.innerHTML = sorted.length
      ? sorted
          .slice(0, 5)
          .map(
            (r) => `<tr><td>${esc(date(r.date))}</td><td>${esc(typeLabel(r.type))}</td><td>${esc(r.description) || '—'}</td><td>${rowPill(r)}</td><td class="num">${esc(formatNpr(r.amount))}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="5" class="sd-empty">No salary records yet.</td></tr>';
  }
  const full = $('sd-statement');
  if (full) {
    full.innerHTML = sorted.length
      ? sorted
          .map(
            (r) => `<tr><td>${esc(date(r.date))}</td><td>${esc(typeLabel(r.type))}</td><td>${esc(r.description) || '—'}</td><td>${esc(r.method) || '—'}</td><td class="num">${esc(formatNpr(r.amount))}</td><td class="num">${esc(formatNpr(r.owedAfter))}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="6" class="sd-empty">No salary records yet.</td></tr>';
  }
  const k = $('sd-pay-kpis');
  if (k) {
    k.innerHTML = bal
      ? [
          ['Total earned', bal.totalEarned],
          ['Deducted', bal.totalDeducted],
          ['Paid', bal.totalPaid],
          ['Still to pay', bal.remaining],
        ]
          .map(([l, v]) => `<div class="sd-kpi"><small>${l}</small><strong>${esc(formatNpr(v as number))}</strong></div>`)
          .join('')
      : '';
  }
}

// ---------- access ----------
// Position -> person: the position gives a base; the owner can allow or
// deny single permissions for this one person. The API decides for real.
let catalogue: CatalogueModule[] = [];
let access: StaffAccess | null = null;
const pending = new Map<string, OverrideEffect>();

function accessState(code: string): OverrideEffect {
  if (pending.has(code)) return pending.get(code)!;
  return access?.overrides[code] ?? 'inherit';
}

function holds(code: string): boolean {
  const state = accessState(code);
  if (state === 'allow') return true;
  if (state === 'deny') return false;
  return !!access?.inherited.includes(code);
}

function renderAccess(m: StaffMember, _positions: Position[]): void {
  const note = $('sd-access-note');
  const body = $('sd-access');
  const wrap = $('sd-access-wrap');
  const save = $('sd-access-save');
  if (!note || !body || !wrap || !save) return;

  if (m.role !== 'staff') {
    note.textContent = 'This account predates positions. Assign a position to give it access.';
    wrap.hidden = true;
    return;
  }
  if (!m.positionId) {
    note.textContent = 'No position is assigned, so this person cannot open any module.';
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;

  const owner = !!getSession()?.isOwner && getSession()?.accessMode !== 'read_only';
  save.hidden = !owner;
  note.textContent = owner
    ? `Access comes from the "${positionLabel(m)}" position${m.extraPositionNames.length ? 's' : ''}. Allow or deny single permissions for this person only. Changing the positions clears these exceptions.`
    : `Access comes from the "${positionLabel(m)}" position${m.extraPositionNames.length ? 's' : ''}.`;

  const mark = (on: boolean) => (on ? '<span class="sd-perm-on">✓</span>' : '<span class="sd-perm-off">—</span>');

  body.innerHTML = catalogue
    .map((mod) => {
      const rows = mod.actions
        .filter((a) => !a.reserved)
        .map((a) => {
          const inherited = !!access?.inherited.includes(a.code);
          const state = accessState(a.code);
          const control = owner
            ? `<select class="sd-override" data-code="${a.code}" aria-label="${esc(a.label)}">
                 <option value="inherit"${state === 'inherit' ? ' selected' : ''}>Inherited</option>
                 <option value="allow"${state === 'allow' ? ' selected' : ''}>Allowed</option>
                 <option value="deny"${state === 'deny' ? ' selected' : ''}>Denied</option>
               </select>`
            : state === 'inherit'
              ? '<span class="sd-perm-off">Inherited</span>'
              : `<span>${state === 'allow' ? 'Allowed' : 'Denied'}</span>`;
          return `<div class="sd-perm-row">
            <span class="sd-perm-name">${esc(a.label)}</span>
            <span class="sd-perm-base" title="From the position">${mark(inherited)}</span>
            <span class="sd-perm-now" title="Result">${mark(holds(a.code))}</span>
            <span class="sd-perm-ctl">${control}</span>
          </div>`;
        })
        .join('');
      return rows
        ? `<div class="sd-perm-group"><h4>${esc(mod.label)}</h4>
            <div class="sd-perm-head"><span>Permission</span><span>Position</span><span>Result</span><span>This person</span></div>
            ${rows}</div>`
        : '';
    })
    .join('');
}

async function loadAccess(m: StaffMember, positions: Position[]): Promise<void> {
  if (m.role === 'staff' && m.positionId) {
    try {
      [catalogue, access] = await Promise.all([loadCatalogue(), getAccess(m.id)]);
      pending.clear();
    } catch (error) {
      const err = $('sd-access-error')!;
      err.textContent = error instanceof ApiError ? error.message : 'Could not load permissions.';
      err.hidden = false;
    }
  }
  renderAccess(m, positions);
}

$('sd-access')?.addEventListener('change', (ev) => {
  const sel = (ev.target as HTMLElement).closest<HTMLSelectElement>('select[data-code]');
  if (!sel) return;
  const code = sel.dataset.code!;
  const value = sel.value as OverrideEffect;
  if (value === (access?.overrides[code] ?? 'inherit')) pending.delete(code);
  else pending.set(code, value);
  // Update the "Result" tick of this row straight away.
  const row = sel.closest('.sd-perm-row');
  const now = row?.querySelector('.sd-perm-now');
  if (now) now.innerHTML = holds(code) ? '<span class="sd-perm-on">✓</span>' : '<span class="sd-perm-off">—</span>';
});

$('sd-access-save')?.addEventListener('click', async () => {
  const err = $('sd-access-error')!;
  err.hidden = true;
  if (!pending.size) return;
  try {
    access = await saveOverrides(
      staffId,
      [...pending].map(([permission, effect]) => ({ permission, effect })),
    );
    pending.clear();
    if (currentMember) renderAccess(currentMember, []);
  } catch (error) {
    err.textContent = error instanceof ApiError ? error.message : 'Could not save.';
    err.hidden = false;
  }
});

// ---------- activity ----------
interface AuditRow {
  id: number;
  created_at: string;
  actor_name: string;
  action: string;
  summary: string;
}
async function loadActivity(): Promise<void> {
  const body = $('sd-activity');
  if (!body) return;
  try {
    const data = await api<{ results: AuditRow[] }>(`/audit/?model=accounts.user&object_id=${staffId}&page_size=50`);
    body.innerHTML = data.results.length
      ? data.results
          .map(
            (r) => `<tr><td>${esc(dateTime(r.created_at))}</td><td>${esc(r.actor_name) || 'System'}</td><td>${esc(typeLabel(r.action))}</td><td style="white-space:normal">${esc(r.summary)}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="4" class="sd-empty">No changes recorded for this account.</td></tr>';
  } catch (error) {
    body.innerHTML = `<tr><td colspan="4" class="sd-empty">${esc(error instanceof ApiError ? error.message : 'Could not load activity.')}</td></tr>`;
  }
}

async function load(): Promise<void> {
  if (!staffId) {
    fail('No staff member selected.');
    text('sd-name', 'Not found');
    return;
  }
  let member: StaffMember;
  try {
    member = await getStaff(staffId);
  } catch (error) {
    text('sd-name', 'Not found');
    fail(error instanceof ApiError ? error.message : 'Could not load this staff member.');
    return;
  }
  renderStaff(member);

  const [positions, salaries, balance, statement] = await Promise.all([
    listPositions().catch(() => [] as Position[]),
    listSalaries().catch(() => [] as SalaryProfile[]),
    getBalance(staffId).catch(() => null),
    listStatement(staffId).catch(() => [] as StatementRow[]),
  ]);
  currentMember = member;
  await loadAccess(member, positions);
  const profile = salaries.find((p) => p.staffId === staffId) ?? null;
  const bal = balance?.balance ?? null;
  renderSalary(profile, bal);
  renderStatement(statement, bal);
  void loadActivity();
  void loadAttendance();
  void loadDocuments();
}

if (session && canManageStaff(session)) {
  void load();
  refreshProfile().catch(() => {});
}
