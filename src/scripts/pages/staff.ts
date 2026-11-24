import { paintAvatar } from '../../lib/avatar';
import { getSession, canManageStaff, canEditPositions, canManagePositions, refreshProfile } from '../../lib/auth';
import { ApiError } from '../../lib/api';
import {
  MODULES,
  ROLE_LABEL,
  listStaff,
  createStaff,
  updateStaff,
  setSignIn,
  deactivateStaff,
  reactivateStaff,
  resetStaffPassword,
  listPositions,
  hiddenPositionCount,
  createPosition,
  updatePosition,
  setPositionActive,
  deletePosition,
  type StaffMember,
  type StaffRole,
  type Position,
  type CatalogueModule,
  type Preset,
  loadCatalogue,
  loadPresets,
  positionLabel,
} from '../../lib/staff';

const session = getSession();
if (!session) {
  window.location.replace('/');
} else if (!canManageStaff(session)) {
  // Only the owner, or staff with the Administration position, manage staff.
  window.location.replace('/dashboard');
}

let members: StaffMember[] = [];
let positions: Position[] = [];
let canWrite = true;
let canEditPos = true;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const val = (id: string) => ($<HTMLInputElement>(id)?.value ?? '').trim();

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const FIELD_LABELS: Record<string, string> = {
  username: 'Username',
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  phone: 'Phone',
  role: 'Role',
  position: 'Position',
  password: 'Password',
  name: 'Name',
  description: 'Description',
  permissions: 'Permissions',
  is_active: 'Status',
};

function describe(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  const entries = Object.entries(error.fields);
  if (entries.length > 0 && error.status === 400) {
    return entries.map(([k, m]) => `${FIELD_LABELS[k] ?? k}: ${m}`).join(' ');
  }
  return error.message;
}

function banner(message: string | null): void {
  const el = $('st-banner');
  if (!el) return;
  el.hidden = !message;
  el.textContent = message ?? '';
}

// ---------- tabs ----------

const header = document.querySelector<HTMLElement>('.header-title');
const pageLooks = {
  team: { title: 'Staffs', sub: 'Manage your team, salary and access.', nav: 'staff' },
  positions: { title: 'Position / Role', sub: 'A position decides what a staff member can see and do.', nav: 'positions' },
} as const;

// Staffs and Position / Role are two menu items; each shows only its own list.
function selectTab(name: 'team' | 'positions'): void {
  for (const t of ['team', 'positions'] as const) {
    $(`tab-${t}`)?.setAttribute('aria-selected', String(t === name));
    const panel = $(`panel-${t}`);
    if (panel) panel.hidden = t !== name;
  }
  const look = pageLooks[name];
  $('st-title')!.textContent = look.title;
  const me = getSession();
  // Someone who is not the owner (for example an administrator) can only read here.
  const viewOnly = !!me && !me.isOwner && me.accessMode !== 'read_only';
  $('st-sub')!.textContent = viewOnly ? 'You can view staff and positions. Only the owner can add or change them.' : look.sub;
  if (header) header.textContent = look.title;
  for (const id of ['st-kpis', 'member-add', 'st-scope']) {
    const el = $(id);
    if (el) el.style.display = name === 'positions' ? 'none' : '';
  }
  document.querySelectorAll<HTMLElement>('.app-sidebar .sidebar-link').forEach((a) => a.classList.toggle('is-active', a.dataset.navId === look.nav));
}
$('tab-team')?.addEventListener('click', () => selectTab('team'));
$('tab-positions')?.addEventListener('click', () => selectTab('positions'));
// The menu opens a tab through the address (#team, #positions).
const tabFromHash = () => selectTab(window.location.hash === '#positions' ? 'positions' : 'team');
window.addEventListener('hashchange', tabFromHash);
tabFromHash();

// ---------- team table ----------

function filteredMembers(): StaffMember[] {
  const q = val('st-search').toLowerCase();
  const role = $<HTMLSelectElement>('st-role-filter')?.value ?? '';
  const status = $<HTMLSelectElement>('st-status-filter')?.value ?? '';
  const pos = $<HTMLSelectElement>('st-position-filter')?.value ?? '';
  return members.filter((m) => {
    if (role && m.role !== role) return false;
    if (pos && String(m.positionId ?? '') !== pos) return false;
    if (status === 'active' && !m.isActive) return false;
    if (status === 'inactive' && m.isActive) return false;
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.username.toLowerCase().includes(q) ||
      m.phone.includes(q) ||
      m.email.toLowerCase().includes(q)
    );
  });
}

function statusOf(m: StaffMember): { label: string; cls: string } {
  if (!m.isActive) return { label: 'Inactive', cls: 'inactive' };
  if (!m.canSignIn) return { label: 'No sign-in', cls: 'pending' };
  if (m.mustChangePassword) return { label: 'Password pending', cls: 'pending' };
  return { label: 'Active', cls: 'active' };
}

const PAGE_SIZE = 8;
let page = 1;
let view: 'list' | 'grid' = 'list';
try {
  if (localStorage.getItem('vgsync-staff-view') === 'grid') view = 'grid';
} catch { /* ignore */ }

const I = (d: string) =>
  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON_EYE = I('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>');
const ICON_EDIT = I('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>');
const ICON_MORE = I('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>');
const ICON_PHONE = I('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>');
const ICON_MAIL = I('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>');

function fmtJoin(iso: string): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function contactHtml(m: StaffMember): string {
  const phone = m.phone ? `<span>${ICON_PHONE}${esc(m.phone)}</span>` : '';
  const mail = m.email ? `<span>${ICON_MAIL}${esc(m.email)}</span>` : '';
  return phone || mail ? `<div class="st-contact">${phone}${mail}</div>` : '<span class="st-sub">—</span>';
}

function actionsHtml(m: StaffMember): string {
  const more = canWrite
    ? `<div class="st-more">
        <button type="button" class="st-icon-btn" data-act="more" data-id="${m.id}" aria-label="More actions" aria-haspopup="menu">${ICON_MORE}</button>
        <div class="st-menu" role="menu" hidden>
          ${m.canSignIn
            ? `<button type="button" role="menuitem" data-act="reset" data-id="${m.id}">Reset password</button>
               <button type="button" role="menuitem" data-act="stop-signin" data-id="${m.id}">Stop sign-in</button>`
            : `<button type="button" role="menuitem" data-act="give-signin" data-id="${m.id}">Give sign-in access</button>`}
          <button type="button" role="menuitem" class="${m.isActive ? 'is-danger' : ''}" data-act="${m.isActive ? 'deactivate' : 'reactivate'}" data-id="${m.id}">${m.isActive ? 'Remove from team' : 'Bring back'}</button>
        </div>
      </div>`
    : '';
  const edit = canWrite
    ? `<button type="button" class="st-icon-btn is-edit" data-act="edit" data-id="${m.id}" aria-label="Edit ${esc(m.name)}" title="Edit">${ICON_EDIT}</button>`
    : '';
  return `<div class="st-actions"><a class="st-icon-btn" href="/staff/detail?id=${m.id}" aria-label="View ${esc(m.name)}" title="View">${ICON_EYE}</a>${edit}${more}</div>`;
}

function avatarHtml(m: StaffMember, cls = ''): string {
  return `<span class="st-avatar ${cls}" data-avatar="${m.id}" data-name="${esc(m.name)}"></span>`;
}

function paintAvatars(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-avatar]').forEach((el) =>
    paintAvatar(el, el.dataset.avatar ?? '', el.dataset.name ?? ''),
  );
}

function renderKpis(): void {
  const active = members.filter((m) => m.isActive).length;
  $('kpi-total')!.textContent = String(members.length);
  $('kpi-active')!.textContent = String(active);
  $('kpi-inactive')!.textContent = String(members.length - active);
}

function renderPager(totalPages: number): void {
  const el = $('st-pages');
  if (!el) return;
  if (totalPages <= 1) {
    el.innerHTML = '';
    return;
  }
  const nums: Array<number | '…'> = [];
  for (let n = 1; n <= totalPages; n++) {
    if (n === 1 || n === totalPages || Math.abs(n - page) <= 1) nums.push(n);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  el.innerHTML =
    `<button type="button" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>` +
    nums
      .map((n) =>
        n === '…'
          ? '<span>…</span>'
          : `<button type="button" data-page="${n}" class="${n === page ? 'is-active' : ''}">${n}</button>`,
      )
      .join('') +
    `<button type="button" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''} aria-label="Next page">›</button>`;
}

function renderMembers(): void {
  const tbody = $('member-tbody');
  const grid = $('st-grid-view');
  const count = $('member-count');
  if (!tbody || !grid) return;
  renderKpis();
  const all = filteredMembers();
  const pill = $('st-pill');
  if (pill) pill.textContent = `${members.length} member${members.length === 1 ? '' : 's'}`;

  $('st-list-view')!.hidden = view !== 'list';
  grid.hidden = view !== 'grid';
  document.querySelectorAll<HTMLButtonElement>('.st-view-btn').forEach((b) => {
    const on = b.dataset.view === view;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  });

  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  if (page > totalPages) page = totalPages;
  const rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (all.length === 0) {
    const msg = members.length ? 'No one matches.' : 'No team members yet.';
    tbody.innerHTML = `<tr><td colspan="7" class="st-empty">${msg}</td></tr>`;
    grid.innerHTML = `<p class="st-empty">${msg}</p>`;
    if (count) count.textContent = '';
    renderPager(1);
    return;
  }

  tbody.innerHTML = rows
    .map((m) => {
      const st = statusOf(m);
      return `<tr>
        <td><a class="st-person" href="/staff/detail?id=${m.id}">${avatarHtml(m)}<span><strong>${esc(m.name)}</strong><span class="st-sub">${esc(m.username)}</span></span></a></td>
        <td>${esc(positionLabel(m)) || '—'}</td>
        <td>${esc(ROLE_LABEL[m.role] ?? m.role)}</td>
        <td>${contactHtml(m)}</td>
        <td>${esc(fmtJoin(m.dateJoined))}</td>
        <td><span class="st-badge st-badge-${st.cls}">${st.label}</span></td>
        <td>${actionsHtml(m)}</td>
      </tr>`;
    })
    .join('');

  grid.innerHTML = rows
    .map((m) => {
      const st = statusOf(m);
      return `<article class="st-card">
        <div class="st-card-top">${avatarHtml(m, 'is-lg')}<span class="st-badge st-badge-${st.cls}">${st.label}</span></div>
        <a class="st-card-name" href="/staff/detail?id=${m.id}">${esc(m.name)}</a>
        <span class="st-sub">${esc(m.username)} · ${esc(ROLE_LABEL[m.role] ?? m.role)}</span>
        <span class="st-card-pos">${esc(positionLabel(m)) || '—'}</span>
        ${contactHtml(m)}
        <div class="st-card-foot"><span class="st-sub">Joined ${esc(fmtJoin(m.dateJoined))}</span>${actionsHtml(m)}</div>
      </article>`;
    })
    .join('');

  paintAvatars(tbody);
  paintAvatars(grid);
  if (count) {
    const from = (page - 1) * PAGE_SIZE + 1;
    count.textContent = `Showing ${from}–${from + rows.length - 1} of ${all.length} staff`;
  }
  renderPager(totalPages);
}

// ---------- positions table ----------

function accessSummary(p: Position): string {
  const viewable = p.granted.filter((c) => c.endsWith('.view')).map((c) => c.split('.')[0]);
  if (viewable.length === 0) return 'No access';
  const extra = p.granted.length - viewable.length;
  const names = viewable.map((id) => MODULES.find((m) => m.id === id)?.label ?? id).join(', ');
  return extra > 0 ? `${names} · ${p.granted.length} permissions` : names;
}

function showHiddenNote(): void {
  const note = document.getElementById('position-hidden');
  if (!note) return;
  const n = hiddenPositionCount();
  note.hidden = n === 0;
  note.textContent =
    n === 0
      ? ''
      : `${n} other position${n === 1 ? ' is' : 's are'} not shown because ${n === 1 ? 'it gives' : 'they give'} more access than you have. ` +
        'Only the owner, or someone with the same access, can see and assign them.';
}

function membersCell(p: Position): string {
  if (p.members.length === 0) return '<span class="st-sub">Nobody yet</span>';
  const MAX = 4;
  const names = p.members.slice(0, MAX).map((m) => esc(m.name));
  const more = p.members.length - MAX;
  return `${names.join(', ')}${more > 0 ? ` <span class="st-sub">+${more} more</span>` : ''}`;
}

function renderPositions(): void {
  showHiddenNote();
  const tbody = $('position-tbody');
  if (!tbody) return;
  // What a position grants is private to the owner.
  const showAccess = !!getSession()?.isOwner;
  const th = document.getElementById('pos-th-access');
  if (th) th.hidden = !showAccess;
  const cols = showAccess ? 6 : 5;
  if (positions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${cols}" class="st-empty">No positions yet. Create one before adding staff.</td></tr>`;
    return;
  }
  tbody.innerHTML = positions
    .map((p) => {
      const actions = canEditPos
        ? `<div class="st-actions">
            <button type="button" class="btn-ghost-sm" data-pact="edit" data-id="${p.id}">Edit</button>
            <button type="button" class="btn-ghost-sm" data-pact="${p.isActive ? 'deactivate' : 'activate'}" data-id="${p.id}">${p.isActive ? 'Deactivate' : 'Activate'}</button>
            <button type="button" class="btn-ghost-sm is-danger" data-pact="delete" data-id="${p.id}">Delete</button>
          </div>`
        : '';
      return `<tr>
        <td><strong>${esc(p.name)}</strong>${p.description ? `<br /><span class="st-sub">${esc(p.description)}</span>` : ''}</td>
        ${showAccess ? `<td class="st-access">${esc(accessSummary(p))}</td>` : ''}
        <td>${membersCell(p)}</td>
        <td class="num">${p.staffCount}</td>
        <td><span class="st-badge st-badge-${p.isActive ? 'active' : 'inactive'}">${p.isActive ? 'Active' : 'Inactive'}</span></td>
        <td>${actions}</td>
      </tr>`;
    })
    .join('');
}

// ---------- load ----------

function applyWriteAccess(): void {
  // A company owner is read-only inside a branch.
  const current = getSession();
  // Adding and changing staff is the owner's alone; everyone else only reads the list.
  canWrite = current?.accessMode !== 'read_only' && !!current?.isOwner;
  // Positions are changed by the owner only; others can read them.
  canEditPos = canWrite && canManagePositions(current);
  const add = $('member-add');
  if (add) add.hidden = !canWrite;
  const addPosition = $('position-add');
  if (addPosition) addPosition.hidden = !canEditPos;
  // Someone who is not the owner manages staff accounts only.
  const roleSelect = $<HTMLSelectElement>('m-role');
  if (roleSelect) {
    const owner = canEditPositions(current);
    for (const option of Array.from(roleSelect.options)) {
      option.hidden = !owner && option.value !== 'staff';
      option.disabled = !owner && option.value !== 'staff';
    }
    if (!owner) roleSelect.value = 'staff';
  }
  const roleFilter = $<HTMLSelectElement>('st-role-filter');
  if (roleFilter && !canEditPositions(current)) roleFilter.hidden = true;
}

async function reload(): Promise<void> {
  const s = getSession();
  const scope = $('st-scope');
  if (scope && s) scope.textContent = `${s.activeBranchName} (${s.activeBranchCode})`;
  applyWriteAccess();

  try {
    [members, positions] = await Promise.all([listStaff(), listPositions()]);
    banner(
      !canWrite
        ? 'Read-only: you are viewing this branch from Head Office.'
        : !canEditPos
          ? 'You can manage staff accounts. Positions are changed by the owner.'
          : null,
    );
  } catch (error) {
    members = [];
    positions = [];
    banner(describe(error));
  }
  fillPositionFilter();
  renderMembers();
  renderPositions();
  openEditFromUrl();
}

function fillPositionFilter(): void {
  const select = $<HTMLSelectElement>('st-position-filter');
  if (!select) return;
  const current = select.value;
  select.innerHTML =
    '<option value="">All Positions</option>' +
    positions.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  select.value = current;
}

let editHandled = false;
function openEditFromUrl(): void {
  if (editHandled) return;
  editHandled = true;
  const id = Number(new URLSearchParams(window.location.search).get('edit'));
  const target = id ? members.find((m) => m.id === id) : null;
  if (target && canWrite) openMember(target);
}

// ---------- member dialog ----------

const memberDialog = $<HTMLDialogElement>('member-dialog');
const secretDialog = $<HTMLDialogElement>('secret-dialog');

function fillPositionSelect(selectedId: number | null): void {
  const select = $<HTMLSelectElement>('m-position');
  if (!select) return;
  const usable = positions.filter((p) => p.isActive || p.id === selectedId);
  select.innerHTML =
    usable.length === 0
      ? '<option value="">Create a position first</option>'
      : usable.map((p) => `<option value="${p.id}">${esc(p.name)}${p.isActive ? '' : ' (inactive)'}</option>`).join('');
  if (selectedId) select.value = String(selectedId);
}

// Checkboxes for the positions this person holds besides the main one.
function fillExtraPositions(selected: number[]): void {
  const box = $('m-extra');
  if (!box) return;
  const main = Number($<HTMLSelectElement>('m-position')?.value) || 0;
  const keep = new Set(selected);
  box.innerHTML = positions
    .filter((p) => (p.isActive || keep.has(p.id)) && p.id !== main)
    .map((p) => `<label class="st-check"><input type="checkbox" value="${p.id}"${keep.has(p.id) ? ' checked' : ''} /> ${esc(p.name)}</label>`)
    .join('') || '<small class="st-hint">No other positions yet.</small>';
}
$('m-position')?.addEventListener('change', () => {
  const picked = [...document.querySelectorAll<HTMLInputElement>('#m-extra input:checked')].map((i) => Number(i.value));
  fillExtraPositions(picked);
});

function syncRole(): void {
  const isStaff = $<HTMLSelectElement>('m-role')?.value === 'staff';
  const extra = $('m-extra-wrap');
  if (extra) extra.hidden = !isStaff;
  const wrap = $('m-position-wrap');
  if (wrap) wrap.hidden = !isStaff;
  syncSignIn();
}

// Without a login there is no username, password or need for a position.
function syncSignIn(): void {
  const editing = Boolean($<HTMLInputElement>('m-id')?.value);
  const on = $<HTMLInputElement>('m-signin')!.checked;
  $('m-signin-wrap')!.hidden = editing;
  $('m-username-wrap')!.hidden = !on;
  if (!editing) $('m-password-wrap')!.hidden = !on;
  const label = $('m-position-wrap')?.querySelector('span');
  if (label) label.textContent = on ? 'Position *' : 'Position (optional)';
}
$('m-signin')?.addEventListener('change', syncSignIn);
$('m-role')?.addEventListener('change', syncRole);

function openMember(edit?: StaffMember): void {
  $('member-title')!.textContent = edit ? 'Edit team member' : 'Add team member';
  applyWriteAccess();
  $<HTMLInputElement>('m-id')!.value = edit ? String(edit.id) : '';
  $<HTMLInputElement>('m-first')!.value = edit?.firstName ?? '';
  $<HTMLInputElement>('m-last')!.value = edit?.lastName ?? '';
  const username = $<HTMLInputElement>('m-username')!;
  username.value = edit?.username ?? '';
  username.readOnly = !!edit; // a username cannot be changed
  $<HTMLInputElement>('m-email')!.value = edit?.email ?? '';
  $<HTMLInputElement>('m-phone')!.value = edit?.phone ?? '';
  $<HTMLSelectElement>('m-role')!.value = edit?.role ?? 'staff';
  $<HTMLInputElement>('m-password')!.value = '';
  $('m-password-wrap')!.hidden = !!edit;
  $('m-hint')!.hidden = !!edit;
  $<HTMLInputElement>('m-signin')!.checked = edit ? edit.canSignIn : true;
  fillPositionSelect(edit?.positionId ?? null);
  fillExtraPositions(edit?.extraPositionIds ?? []);
  syncRole();
  $('m-error')!.hidden = true;
  memberDialog?.showModal();
}

function showSecret(who: string, password: string): void {
  $('secret-who')!.textContent = who;
  $('secret-value')!.textContent = password;
  $('secret-copy')!.textContent = 'Copy';
  secretDialog?.showModal();
}

$('member-add')?.addEventListener('click', () => openMember());
$('m-cancel')?.addEventListener('click', () => memberDialog?.close());

$('secret-copy')?.addEventListener('click', async () => {
  const text = $('secret-value')?.textContent ?? '';
  try {
    await navigator.clipboard.writeText(text);
    $('secret-copy')!.textContent = 'Copied';
  } catch {
    // Clipboard can be blocked; the text is selectable on screen.
    $('secret-copy')!.textContent = 'Select and copy';
  }
});
// Clear the password from the page as soon as the dialog closes.
secretDialog?.addEventListener('close', () => {
  $('secret-value')!.textContent = '';
});
$('secret-close')?.addEventListener('click', () => secretDialog?.close());

$<HTMLFormElement>('member-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('m-error')!;
  const save = $<HTMLButtonElement>('m-save')!;
  err.hidden = true;

  const id = Number(val('m-id')) || null;
  const role = $<HTMLSelectElement>('m-role')!.value as StaffRole;
  const positionId = Number($<HTMLSelectElement>('m-position')!.value) || null;
  const canSignIn = id ? true : $<HTMLInputElement>('m-signin')!.checked;
  const input = {
    canSignIn,
    firstName: val('m-first'),
    lastName: val('m-last'),
    username: val('m-username'),
    email: val('m-email'),
    phone: val('m-phone'),
    role,
    positionId,
    extraPositionIds: [...document.querySelectorAll<HTMLInputElement>('#m-extra input:checked')].map((i) => Number(i.value)),
    password: $<HTMLInputElement>('m-password')!.value,
  };

  const problem = !input.firstName
    ? 'First name is required.'
    : !id && canSignIn && !input.username
      ? 'Username is required.'
      : role === 'staff' && !positionId && (canSignIn || (id && members.find((m) => m.id === id)?.canSignIn))
        ? 'Choose a position for staff.'
        : null;
  if (problem) {
    err.hidden = false;
    err.textContent = problem;
    return;
  }

  save.disabled = true;
  try {
    if (id) {
      await updateStaff(id, input);
      memberDialog?.close();
    } else {
      const { member, temporaryPassword } = await createStaff(input);
      memberDialog?.close();
      if (temporaryPassword) {
        showSecret(`Username: ${member.username}`, temporaryPassword);
      }
    }
    await reload();
  } catch (error) {
    err.hidden = false;
    err.textContent = describe(error);
  } finally {
    save.disabled = false;
  }
});

// ---------- team row actions ----------

function closeMenus(): void {
  document.querySelectorAll<HTMLElement>('.st-menu').forEach((m) => (m.hidden = true));
}
document.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('.st-more')) closeMenus();
});

$('st-directory')?.addEventListener('click', async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
  if (!button) return;
  if (button.dataset.act === 'more') {
    const menu = button.parentElement?.querySelector<HTMLElement>('.st-menu');
    const wasHidden = menu?.hidden ?? true;
    closeMenus();
    if (menu) menu.hidden = !wasHidden;
    return;
  }
  closeMenus();
  const member = members.find((m) => m.id === Number(button.dataset.id));
  if (!member) return;

  const act = button.dataset.act;
  if (act === 'edit') {
    openMember(member);
    return;
  }

  if (act === 'reactivate' && member.role === 'staff' && !member.positionId) {
    // Their old position was removed while they were switched off.
    alert(`${member.name} has no position now. Choose one, save, then reactivate.`);
    openMember(member);
    return;
  }

  if (act === 'give-signin' && member.role === 'staff' && !member.positionId) {
    alert(`Choose a position for ${member.name} first, save, then give sign-in access.`);
    openMember(member);
    return;
  }

  if (act === 'stop-signin' && !confirm(`Stop ${member.name} from signing in? Their pay and everything they did stays.`)) return;

  if (act === 'deactivate' && !confirm(`Remove ${member.name} from the team? They are signed out and cannot sign in again. Everything they created stays, and their position is not changed. You can find them under Former staff.`)) return;
  if (act === 'reset' && !confirm(`Reset the password for ${member.name}? They will be signed out everywhere.`)) return;

  button.disabled = true;
  try {
    if (act === 'deactivate') await deactivateStaff(member.id);
    else if (act === 'reactivate') await reactivateStaff(member.id);
    else if (act === 'give-signin') {
      const { temporaryPassword } = await setSignIn(member.id, true);
      if (temporaryPassword) showSecret(`Username: ${member.username}`, temporaryPassword);
    } else if (act === 'stop-signin') await setSignIn(member.id, false);
    else if (act === 'reset') {
      const password = await resetStaffPassword(member.id);
      if (password) showSecret(`New password for ${member.username}`, password);
    }
    await reload();
  } catch (error) {
    alert(describe(error));
    button.disabled = false;
  }
});

const refilter = (): void => {
  page = 1;
  renderMembers();
};
$('st-search')?.addEventListener('input', refilter);
['st-role-filter', 'st-status-filter', 'st-position-filter'].forEach((id) =>
  $(id)?.addEventListener('change', refilter),
);
$('st-pages')?.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-page]');
  if (!b || b.disabled) return;
  page = Number(b.dataset.page) || 1;
  renderMembers();
});
document.querySelectorAll<HTMLButtonElement>('.st-view-btn').forEach((b) =>
  b.addEventListener('click', () => {
    view = b.dataset.view === 'grid' ? 'grid' : 'list';
    try {
      localStorage.setItem('vgsync-staff-view', view);
    } catch { /* ignore */ }
    renderMembers();
  }),
);

// ---------- position dialog ----------

const positionDialog = $<HTMLDialogElement>('position-dialog');

let catalogue: CatalogueModule[] = [];
let presets: Preset[] = [];

async function ensureCatalogue(): Promise<void> {
  if (catalogue.length) return;
  [catalogue, presets] = await Promise.all([loadCatalogue(), loadPresets()]);
  const sel = $<HTMLSelectElement>('p-preset')!;
  sel.innerHTML =
    '<option value="">Blank</option>' +
    presets.map((p) => `<option value="${esc(p.key)}">${esc(p.label)}</option>`).join('');
}

function renderPermGroups(granted: Set<string>): void {
  $('perm-groups')!.innerHTML = catalogue
    .map((mod) => {
      const boxes = mod.actions
        .filter((a) => !a.reserved)
        .map(
          (a) => `<label class="st-perm-box">
            <input type="checkbox" data-code="${a.code}" ${granted.has(a.code) ? 'checked' : ''} />
            <span>${esc(a.label)}</span></label>`,
        )
        .join('');
      return boxes ? `<fieldset class="st-perm-group"><legend>${esc(mod.label)}</legend>${boxes}</fieldset>` : '';
    })
    .join('');
}

function readCodes(): string[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('#perm-groups input[data-code]'))
    .filter((b) => b.checked)
    .map((b) => b.dataset.code!);
}

async function openPosition(edit?: Position): Promise<void> {
  $('position-title')!.textContent = edit ? 'Edit position' : 'New position';
  $<HTMLInputElement>('p-id')!.value = edit ? String(edit.id) : '';
  $<HTMLInputElement>('p-name')!.value = edit?.name ?? '';
  $<HTMLInputElement>('p-desc')!.value = edit?.description ?? '';
  $<HTMLInputElement>('p-dept')!.value = edit?.department ?? '';
  $('p-error')!.hidden = true;
  try {
    await ensureCatalogue();
  } catch (error) {
    $('p-error')!.hidden = false;
    $('p-error')!.textContent = describe(error);
  }
  $<HTMLSelectElement>('p-preset')!.value = '';
  $('p-preset-wrap')!.hidden = !!edit;
  renderPermGroups(new Set(edit?.granted ?? []));
  positionDialog?.showModal();
}

// A preset only fills the boxes (you can change them before saving).
$('p-preset')?.addEventListener('change', (event) => {
  const preset = presets.find((p) => p.key === (event.target as HTMLSelectElement).value);
  if (!preset) return;
  renderPermGroups(new Set(preset.permissions));
  const dept = $<HTMLInputElement>('p-dept')!;
  if (!dept.value) dept.value = preset.department;
  const name = $<HTMLInputElement>('p-name')!;
  if (!name.value) name.value = preset.label;
});

// Create/Edit/Delete need View: tick View for them, untick the rest with it.
$('perm-groups')?.addEventListener('change', (event) => {
  const box = event.target as HTMLInputElement;
  const code = box.dataset.code;
  if (!code) return;
  const [module, action] = code.split('.');
  const get = (a: string) =>
    document.querySelector<HTMLInputElement>(`#perm-groups input[data-code="${module}.${a}"]`);
  if (action !== 'view' && box.checked) {
    const view = get('view');
    if (view) view.checked = true;
  }
  if (action === 'view' && !box.checked) {
    document
      .querySelectorAll<HTMLInputElement>(`#perm-groups input[data-code^="${module}."]`)
      .forEach((b) => (b.checked = false));
  }
});

$('position-add')?.addEventListener('click', () => void openPosition());
$('p-cancel')?.addEventListener('click', () => positionDialog?.close());

$<HTMLFormElement>('position-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('p-error')!;
  const save = $<HTMLButtonElement>('p-save')!;
  err.hidden = true;

  const id = Number(val('p-id')) || null;
  const input = {
    name: val('p-name'),
    description: val('p-desc'),
    department: val('p-dept'),
    codes: readCodes(),
    preset: id ? undefined : val('p-preset') || undefined,
  };
  if (!input.name) {
    err.hidden = false;
    err.textContent = 'Name is required.';
    return;
  }

  save.disabled = true;
  try {
    if (id) await updatePosition(id, input);
    else await createPosition(input);
    positionDialog?.close();
    await reload();
  } catch (error) {
    err.hidden = false;
    err.textContent = describe(error);
  } finally {
    save.disabled = false;
  }
});

$('position-tbody')?.addEventListener('click', async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-pact]');
  if (!button) return;
  const position = positions.find((p) => p.id === Number(button.dataset.id));
  if (!position) return;

  const act = button.dataset.pact;
  if (act === 'edit') {
    void openPosition(position);
    return;
  }
  if (act === 'delete' && !confirm(`Delete the position "${position.name}"?`)) return;

  button.disabled = true;
  try {
    if (act === 'delete') await deletePosition(position.id);
    else await setPositionActive(position.id, act === 'activate');
    await reload();
  } catch (error) {
    alert(describe(error));
    button.disabled = false;
  }
});

if (session && canManageStaff(session)) {
  void reload();
  refreshProfile()
    .then((fresh) => {
      // Re-check after the server confirms the role.
      if (fresh && !canManageStaff(fresh)) window.location.replace('/dashboard');
      else applyWriteAccess();
    })
    .catch(() => {});
}
