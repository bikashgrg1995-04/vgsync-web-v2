import { getSession, ApiError, can } from '../../lib/auth';
import { paintAvatar, setAvatarFromFile, clearAvatar } from '../../lib/avatar';
import { getMyProfile, saveMyProfile, getBusiness, getCompanyName } from '../../lib/settings';
import { api, apiDownload } from '../../lib/api';
import { listStaff, listPositions, loadCatalogue } from '../../lib/staff';

const THEME_KEY = 'vgsync-theme';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;
const input = (id: string) => $<HTMLInputElement>(id)!;
const setText = (id: string, text: string) => { const el = $(id); if (el) el.textContent = text || '—'; };

function toast(msg = 'Saved'): void {
  const el = $('settings-toast');
  if (!el) return;
  el.textContent = msg; el.hidden = false;
  window.clearTimeout((el as any)._t);
  (el as any)._t = window.setTimeout(() => { el.hidden = true; }, 2200);
}

function setError(id: string, message: string | null): void {
  const el = $(id);
  if (!el) return;
  el.hidden = !message;
  el.textContent = message ?? '';
}

function describe(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  if (error.status === 403) return 'You do not have permission to change this.';
  const parts = Object.entries(error.fields ?? {}).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${[v].flat().join(' ')}`);
  return error.status === 400 && parts.length ? parts.join(' ') : error.message;
}


// ---- Users & Permissions: a read-only overview; the editing lives in Staff.
const escHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
let usersLoaded = false;

async function loadUsersPanel(): Promise<void> {
  if (usersLoaded) return;
  usersLoaded = true;
  setError('u-error', null);
  const [staff, positions, catalogue] = await Promise.allSettled([listStaff(), listPositions(), loadCatalogue()]);

  if (staff.status === 'fulfilled') {
    setText('u-active', String(staff.value.filter((m) => m.isActive).length));
    setText('u-inactive', String(staff.value.filter((m) => !m.isActive).length));
  }
  if (positions.status === 'fulfilled') {
    setText('u-positions', String(positions.value.length));
    $('u-positions-body')!.innerHTML = positions.value.length
      ? positions.value
          .map((p) => `<tr><td><strong>${escHtml(p.name)}</strong>${p.department ? `<small>${escHtml(p.department)}</small>` : ''}</td><td class="num">${p.staffCount}</td><td class="num">${p.granted.length}</td><td>${p.isActive ? 'Active' : 'Off'}</td></tr>`)
          .join('')
      : '<tr><td colspan="4" class="se-u-empty">No positions yet. Add one from Manage positions.</td></tr>';
  } else {
    setError('u-error', describe(positions.reason));
  }
  if (catalogue.status === 'fulfilled') {
    const reserved = catalogue.value.flatMap((m) => m.actions.filter((a) => a.reserved).map((a) => a.label));
    $('u-reserved')!.innerHTML = reserved.length ? reserved.map((l) => `<li>${escHtml(l)}</li>`).join('') : '<li class="se-u-empty">None.</li>';
  }

  try {
    const models = ['accounts.position', 'accounts.positionpermission', 'accounts.staffpermissionoverride'];
    const pages = await Promise.all(models.map((m) => api<{ results: Array<{ id: number; created_at: string; actor_name: string; summary: string }> }>(`/audit/?model=${m}&page_size=8`)));
    const rows = pages.flatMap((p) => p.results).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10);
    $('u-audit-body')!.innerHTML = rows.length
      ? rows.map((r) => `<tr><td>${escHtml(new Date(r.created_at).toLocaleString())}</td><td>${escHtml(r.actor_name || 'System')}</td><td class="wrap">${escHtml(r.summary)}</td></tr>`).join('')
      : '<tr><td colspan="3" class="se-u-empty">No changes yet.</td></tr>';
  } catch (error) {
    $('u-audit-body')!.innerHTML = `<tr><td colspan="3" class="se-u-empty">${escHtml(describe(error))}</td></tr>`;
  }
}

function showTab(id: string): void {
  document.querySelectorAll('[data-settings-tab]').forEach((b) => b.classList.toggle('is-active', (b as HTMLElement).dataset.settingsTab === id));
  document.querySelectorAll('[data-settings-panel]').forEach((p) => p.classList.toggle('is-active', (p as HTMLElement).dataset.settingsPanel === id));
}
document.querySelectorAll<HTMLButtonElement>('[data-settings-tab]').forEach((btn) => {
  btn.addEventListener('click', () => showTab(btn.dataset.settingsTab!));
});
document.querySelector('[data-settings-tab="users"]')?.addEventListener('click', () => void loadUsersPanel());


// ---- Backup: owners download a ZIP of their data; only a note of it is kept.
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
let backupLoaded = false;

const KIND: Record<string, string> = { backup: 'Backup', restore: 'Restore', safety: 'Safety copy before a restore' };

async function loadBackups(): Promise<void> {
  const body = $('bk-rows')!;
  try {
    const data = await api<{ results: Array<{ id: number; kind: string; has_file: boolean; created_at: string; created_by_name: string; scope: string; business_count: number; row_count: number; size_bytes: number }> }>('/backups/');
    backupLoaded = true;
    body.innerHTML = data.results.length
      ? data.results.map((b) => `<tr><td>${escHtml(new Date(b.created_at).toLocaleString())}</td><td>${escHtml(KIND[b.kind] ?? b.kind)}</td><td>${escHtml(b.created_by_name)}</td><td>${b.scope === 'company' ? `Whole company (${b.business_count} businesses)` : 'This business'}</td><td class="num">${b.row_count.toLocaleString()}</td><td class="num">${b.kind === 'restore' ? '' : fmtSize(b.size_bytes)}</td><td>${b.has_file && canRestoreNow ? `<button type="button" class="se-btn is-outline" data-safety="${b.id}">Download</button>` : ''}</td></tr>`).join('')
      : '<tr><td colspan="7" class="se-u-empty">No backups taken yet.</td></tr>';
    body.querySelectorAll<HTMLButtonElement>('button[data-safety]').forEach((btn) =>
      btn.addEventListener('click', () => void apiDownload(`/backups/${btn.dataset.safety}/download/`, 'vgsync-safety-copy.zip')),
    );
  } catch {
    body.innerHTML = '<tr><td colspan="7" class="se-u-empty">Could not load the backup history.</td></tr>';
  }
}

// ---- Restore: check the file first, then confirm by typing the business code.
let canRestoreNow = false;
let restoreCode = '';

const rErr = (text: string | null) => { const el = $('bk-rerror')!; el.textContent = text ?? ''; el.hidden = !text; };

async function postFile<T>(path: string, extra: Record<string, string> = {}): Promise<T> {
  const file = ($('bk-file') as HTMLInputElement).files?.[0];
  if (!file) throw new Error('Choose the backup file first.');
  const form = new FormData();
  form.append('file', file);
  Object.entries(extra).forEach(([k, v]) => form.append(k, v));
  return api<T>(path, { method: 'POST', body: form });
}

const apiMessage = (error: unknown) => (error instanceof ApiError ? (error.message || 'The file could not be used.') : error instanceof Error ? error.message : 'Something went wrong.');

async function checkFile(): Promise<void> {
  rErr(null);
  $('bk-preview')!.hidden = true;
  const btn = $('bk-check') as HTMLButtonElement;
  btn.disabled = true;
  try {
    const p = await postFile<{ created_at: string; created_by: string; backup_rows: number; current_rows: number; tables: Array<{ table: string; now: number; backup: number }> }>('/backups/restore-preview/');
    $('bk-pinfo')!.textContent = `Backup taken ${new Date(p.created_at).toLocaleString()} by ${p.created_by}. ${p.current_rows.toLocaleString()} records now, ${p.backup_rows.toLocaleString()} in the file.`;
    $('bk-ptable')!.innerHTML = p.tables.map((t) => `<tr><td>${escHtml(t.table.split('.')[1])}</td><td class="num">${t.now}</td><td class="num">${t.backup}${t.now !== t.backup ? ' •' : ''}</td></tr>`).join('');
    $('bk-chint')!.textContent = `To go ahead, type ${restoreCode} and press Restore now.`;
    ($('bk-confirm') as HTMLInputElement).value = '';
    ($('bk-restore') as HTMLButtonElement).disabled = true;
    $('bk-preview')!.hidden = false;
  } catch (error) {
    rErr(apiMessage(error));
  } finally {
    btn.disabled = false;
  }
}

async function doRestore(): Promise<void> {
  rErr(null);
  const btn = $('bk-restore') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Restoring…';
  try {
    const r = await postFile<{ restored: number }>('/backups/restore/', { confirm: ($('bk-confirm') as HTMLInputElement).value.trim() });
    $('bk-preview')!.hidden = true;
    ($('bk-file') as HTMLInputElement).value = '';
    const msg = $('bk-msg')!;
    msg.textContent = `Restored ${r.restored.toLocaleString()} records. A safety copy of your data from before the restore is in the list below.`;
    msg.hidden = false;
    await loadBackups();
  } catch (error) {
    rErr(apiMessage(error));
    btn.disabled = false;
  } finally {
    btn.textContent = 'Restore now';
  }
}


// ---- Old VGSync data: check the file, then confirm by typing the business code.
type LegacyReport = { counts: Record<string, number>; not_imported: Array<{ what: string; count: number }>; warnings: string[]; created: Record<string, number>; safety_copy?: boolean };
const lgErr = (text: string | null) => { const el = $('lg-error')!; el.textContent = text ?? ''; el.hidden = !text; };
const lgPost = <T,>(path: string, extra: Record<string, string> = {}): Promise<T> => {
  const file = ($('lg-file') as HTMLInputElement).files?.[0];
  if (!file) return Promise.reject(new Error('Choose the data file first.'));
  const form = new FormData();
  form.append('file', file);
  Object.entries(extra).forEach(([k, v]) => form.append(k, v));
  return api<T>(path, { method: 'POST', body: form });
};
const lgSummary = (c: Record<string, number>) =>
  `${(c.products ?? 0).toLocaleString()} products (${(c.products_with_stock ?? 0).toLocaleString()} with stock), ${c.suppliers ?? 0} suppliers, ${c.purchases ?? 0} purchases, ${(c.sales ?? 0).toLocaleString()} sales, ${c.followups ?? 0} follow-ups, ${c.expenses ?? 0} expenses`;

async function lgCheck(): Promise<void> {
  lgErr(null);
  $('lg-preview')!.hidden = true;
  const btn = $('lg-check') as HTMLButtonElement;
  btn.disabled = true;
  try {
    const r = await lgPost<LegacyReport>('/backups/legacy-preview/');
    const skipped = r.not_imported.map((n) => `${n.count} ${n.what}`).join('; ');
    $('lg-info')!.textContent = `Will import: ${lgSummary(r.created)}.` + (skipped ? ` Not imported: ${skipped}.` : '') + (r.warnings.length ? ` ${r.warnings.length} note(s), for example: ${r.warnings[0]}` : '');
    $('lg-hint')!.textContent = `To go ahead, type ${restoreCode} and press Import now.`;
    ($('lg-confirm') as HTMLInputElement).value = '';
    ($('lg-import') as HTMLButtonElement).disabled = true;
    $('lg-preview')!.hidden = false;
  } catch (error) {
    lgErr(apiMessage(error));
  } finally {
    btn.disabled = false;
  }
}

async function lgImport(): Promise<void> {
  lgErr(null);
  const btn = $('lg-import') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Importing…';
  try {
    const r = await lgPost<LegacyReport>('/backups/legacy-import/', { confirm: ($('lg-confirm') as HTMLInputElement).value.trim() });
    $('lg-preview')!.hidden = true;
    ($('lg-file') as HTMLInputElement).value = '';
    const msg = $('bk-msg')!;
    msg.textContent = `Imported ${lgSummary(r.created)}. A safety copy from before the import is in the list below.`;
    msg.hidden = false;
    await loadBackups();
  } catch (error) {
    lgErr(apiMessage(error));
    btn.disabled = false;
  } finally {
    btn.textContent = 'Import now';
  }
}

$('lg-check')?.addEventListener('click', () => void lgCheck());
$('lg-import')?.addEventListener('click', () => void lgImport());
$('lg-confirm')?.addEventListener('input', () => {
  ($('lg-import') as HTMLButtonElement).disabled = ($('lg-confirm') as HTMLInputElement).value.trim() !== restoreCode;
});

$('bk-check')?.addEventListener('click', () => void checkFile());
$('bk-restore')?.addEventListener('click', () => void doRestore());
$('bk-confirm')?.addEventListener('input', () => {
  ($('bk-restore') as HTMLButtonElement).disabled = ($('bk-confirm') as HTMLInputElement).value.trim() !== restoreCode;
});

async function takeBackup(button: HTMLButtonElement): Promise<void> {
  const msg = $('bk-msg')!;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Preparing…';
  msg.hidden = true;
  try {
    await apiDownload('/backups/', 'vgsync-backup.zip', 'POST');
    msg.textContent = 'Backup downloaded.';
    msg.hidden = false;
    await loadBackups();
  } catch (error) {
    msg.textContent = error instanceof ApiError && error.status === 403 ? 'Only the owner can take a backup, and not while viewing a branch from the Head Office.' : 'Could not create the backup. Please try again.';
    msg.hidden = false;
    document.querySelector<HTMLButtonElement>('[data-settings-tab="backup"]')?.click();
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

document.querySelector('[data-settings-tab="backup"]')?.addEventListener('click', () => { if (!backupLoaded) void loadBackups(); });
$('bk-download')?.addEventListener('click', () => void takeBackup($('bk-download') as HTMLButtonElement));
$('bk-quick')?.addEventListener('click', () => void takeBackup($('bk-quick') as HTMLButtonElement));

const session = getSession();
if (!session) window.location.replace('/');
else {
  const me = session;
  const avatar = $('settings-avatar');
  const avatarHint = $('avatar-hint');
  const nameLine = $('settings-display-name');

  function paintName(name: string): void {
    if (nameLine) nameLine.textContent = name;
    paintAvatar(avatar, me.userId, name);
    const side = $('sidebar-profile-name');
    if (side) side.textContent = name;
    paintAvatar($('sidebar-profile-initials'), me.userId, name);
    paintAvatar($('header-avatar'), me.userId, name);
  }

  // ---- General cards (from the session; owners also get address and phone)
  setText('gen-name', me.activeBranchName);
  input('gen-name').value = me.activeBranchName;
  setText('gen-branch', me.activeBranchName);
  if (me.businessType === 'independent') {
    setText('gen-info-title', 'Business Information');
    setText('gen-info-sub', 'Manage business details');
    setText('gen-name-label', 'Business Name');
  }
  setText('gen-code', me.activeBranchCode);
  setText('gen-initial', (me.activeBranchName || 'B')[0].toUpperCase());
  let loggedIn = me.loggedInAt;
  try { loggedIn = new Date(me.loggedInAt).toLocaleString(); } catch { /* keep the raw value */ }
  setText('gen-session', `Signed in ${loggedIn}`);
  setText('gen-password', me.mustChangePassword ? 'You must update your password' : 'Up to date');

  // ---- Profile
  paintAvatar(avatar, me.userId, me.displayName);
  if (nameLine) nameLine.textContent = me.displayName;
  setText('settings-role-line', `${me.roleLabel} · ${me.homeBranchName}`);
  input('set-username').value = me.username;
  input('set-role').value = me.roleLabel;
  input('set-home-branch').value = me.homeBranchName;
  input('set-email').value = me.email;

  getMyProfile().then((p) => {
    input('set-first').value = p.firstName;
    input('set-last').value = p.lastName;
    input('set-email').value = p.email;
    input('set-phone').value = p.phone;
  }).catch(() => setError('profile-error', 'Could not load your profile.'));

  // Photo stays on this device.
  async function onAvatarFile(file: File | undefined | null) {
    if (!file) return;
    const result = await setAvatarFromFile(me.userId, file);
    if (!result.ok) {
      if (avatarHint) { avatarHint.textContent = result.error; avatarHint.classList.add('is-error'); }
      toast(result.error);
      return;
    }
    paintAvatar(avatar, me.userId, me.displayName);
    paintAvatar($('sidebar-profile-initials'), me.userId, me.displayName);
    paintAvatar($('header-avatar'), me.userId, me.displayName);
    if (avatarHint) { avatarHint.textContent = 'JPG, PNG or WebP · max 512 KB · kept on this device'; avatarHint.classList.remove('is-error'); }
    toast('Profile photo updated');
  }
  const fileInput = $<HTMLInputElement>('avatar-file');
  fileInput?.addEventListener('change', () => { void onAvatarFile(fileInput.files?.[0]); fileInput.value = ''; });
  $('avatar-change')?.addEventListener('click', () => fileInput?.click());
  $('avatar-remove')?.addEventListener('click', () => {
    clearAvatar(me.userId);
    paintAvatar(avatar, me.userId, me.displayName);
    paintAvatar($('sidebar-profile-initials'), me.userId, me.displayName);
    paintAvatar($('header-avatar'), me.userId, me.displayName);
    toast('Profile photo removed');
  });

  $('save-profile')?.addEventListener('click', async () => {
    const btn = $<HTMLButtonElement>('save-profile')!;
    btn.disabled = true;
    setError('profile-error', null);
    try {
      const saved = await saveMyProfile({
        firstName: input('set-first').value,
        lastName: input('set-last').value,
        email: input('set-email').value,
        phone: input('set-phone').value,
      });
      paintName(`${saved.firstName} ${saved.lastName}`.trim() || me.username);
      toast('Profile saved');
    } catch (error) {
      setError('profile-error', describe(error));
    } finally {
      btn.disabled = false;
    }
  });

  // ---- Backup: the owner and anyone whose position allows it.
  if (can(session, 'backup.view')) {
    $('tab-backup')!.hidden = false;
    const wide = me.role === 'owner';
    setText('bk-scope', wide ? 'Includes every branch and the Head Office' : "A copy of this business's data");
    $('bk-download')!.hidden = !can(session, 'backup.create');
    $('bk-quick')!.hidden = !can(session, 'backup.create');
    canRestoreNow = can(session, 'backup.restore');
    restoreCode = me.activeBranchCode;
    $('bk-restore-card')!.hidden = !canRestoreNow;
    $('lg-card')!.hidden = !canRestoreNow;
  }

  // ---- Business details: owners can look, only VGSync support changes them.
  const isOwner = me.role === 'owner' || me.role === 'branch_owner';
  // Administrators see the Users & Permissions overview when they hold one of its parts.
  if (isOwner || ['staff.view_audit', 'staff.manage_positions'].some((c) => can(session, c))) {
    $('tab-users')!.hidden = false;
  }
  if (isOwner) {
    $('tab-business')!.hidden = false;
    setText('biz-active', me.activeBranchName);
    setText('biz-code', me.activeBranchCode);
    void (async () => {
      try {
        const [biz, company] = await Promise.all([
          getBusiness(me.activeBusinessId),
          me.role === 'owner' ? getCompanyName() : Promise.resolve(null),
        ]);
        input('biz-name').value = biz.name;
        input('biz-address').value = biz.address;
        input('biz-phone').value = biz.phone;
        input('biz-email').value = biz.email;
        setText('gen-address', biz.address);
        setText('gen-contact', [biz.phone, biz.email].filter(Boolean).join(' · '));
        if (company !== null) {
          $('biz-company-wrap')!.hidden = false;
          input('biz-company').value = company;
        }
      } catch (error) {
        setError('biz-error', describe(error));
      }
    })();
  } else {
    setText('gen-address', 'Visible to owners');
    setText('gen-contact', 'Visible to owners');
  }

  // ---- Security tab
  setText('sec-session', loggedIn);
  setText('sec-password-status', me.mustChangePassword ? 'Must update password' : 'Up to date');

  // ---- Appearance
  const root = document.documentElement;
  const theme = root.dataset.theme === 'light' ? 'light' : 'dark';
  document.querySelectorAll('[data-set-theme]').forEach((el) => {
    el.classList.toggle('is-active', el.getAttribute('data-set-theme') === theme);
    el.addEventListener('click', () => {
      const t = el.getAttribute('data-set-theme') as 'light' | 'dark';
      root.dataset.theme = t;
      try { localStorage.setItem(THEME_KEY, t); } catch { /* storage can be blocked */ }
      document.querySelectorAll('[data-set-theme]').forEach((x) => x.classList.toggle('is-active', x.getAttribute('data-set-theme') === t));
      const toggle = $('theme-toggle');
      toggle?.classList.toggle('is-dark', t === 'dark');
      toggle?.classList.toggle('is-light', t === 'light');
      toast('Theme updated');
    });
  });
}
