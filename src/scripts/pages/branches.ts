import { getSession, switchBranch } from '../../lib/auth';
import { ApiError } from '../../lib/api';
import { getCompanyName } from '../../lib/settings';
import { listBusinesses, TYPE_LABEL, type BusinessRow } from '../../lib/branches';

const session = getSession();
if (!session) window.location.replace('/');
// Only the company owner manages the list of branches.
else if (!(session.isOwner && session.role === 'owner')) window.location.replace('/dashboard');

let rows: BusinessRow[] = [];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const val = (id: string) => $<HTMLInputElement>(id).value;
const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function describe(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  if (error.status === 403) return 'Only the company owner can see this.';
  const parts = Object.entries(error.fields ?? {}).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${[v].flat().join(' ')}`);
  return error.status === 400 && parts.length ? parts.join(' ') : error.message;
}

function notice(message: string | null): void {
  const el = $('br-notice');
  el.hidden = !message;
  el.textContent = message ?? '';
}

async function open(id: number): Promise<void> {
  try {
    await switchBranch(id);
    window.location.href = '/branches';
  } catch (error) {
    notice(describe(error));
  }
}

function render(): void {
  const q = val('br-search').trim().toLowerCase();
  const st = val('br-status');
  const view = rows.filter(
    (r) =>
      (!q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)) &&
      (!st || (st === 'active' ? r.isActive : !r.isActive)),
  );
  const session = getSession();
  const tbody = $('br-tbody');
  if (view.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="br-empty">${rows.length ? 'Nothing matches.' : 'No branches yet.'}</td></tr>`;
  } else {
    tbody.innerHTML = view
      .map((r) => {
        const here = session?.activeBusinessId === r.id;
        const acts: string[] = [];
        if (r.isActive && !here) acts.push(`<button class="br-link" data-open="${r.id}">Open</button>`);
        const contact = [r.phone, r.email].filter(Boolean).map(esc).join('<br />');
        return `<tr class="${r.isActive ? '' : 'is-off'}">
          <td><strong>${esc(r.name)}</strong>${here ? ' <span class="br-tag">You are here</span>' : ''}<br /><span class="br-muted">${esc(TYPE_LABEL[r.type])}${r.address ? ' · ' + esc(r.address) : ''}</span></td>
          <td>${esc(r.code)}</td>
          <td>${contact || '<span class="br-muted">—</span>'}</td>
          <td><span class="br-badge ${r.isActive ? 'br-ok' : 'br-off'}">${r.isActive ? 'Active' : 'Inactive'}</span></td>
          <td class="br-acts">${acts.join(' ')}</td>
        </tr>`;
      })
      .join('');
  }
  const branches = rows.filter((r) => r.type === 'branch');
  $('br-foot').textContent = `${branches.filter((r) => r.isActive).length} active and ${branches.filter((r) => !r.isActive).length} inactive branches. A switched-off branch cannot be used.`;

  tbody.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((b) => b.addEventListener('click', () => void open(Number(b.dataset.open))));
}

async function load(): Promise<void> {
  const s = getSession();
  if (!s) return;
  if (s.role !== 'owner') {
    $('br-tbody').innerHTML = `<tr><td colspan="5" class="br-empty">Branches are managed by the company owner.</td></tr>`;
    return;
  }
  try {
    const [list, company] = await Promise.all([listBusinesses(), getCompanyName().catch(() => null)]);
    rows = list;
    $('br-company').textContent = company ?? s.companyName ?? 'Company';
  } catch (error) {
    $('br-tbody').innerHTML = `<tr><td colspan="5" class="br-empty">${esc(describe(error))}</td></tr>`;
    return;
  }
  notice('To add a branch, change details or switch one off (for example when a subscription is unpaid), contact VGSync support.');
  render();
}

$('br-search').addEventListener('input', render);
$('br-status').addEventListener('change', render);
void load();
