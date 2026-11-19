import { ApiError } from '../../lib/api';
import { can, getSession } from '../../lib/auth';
import { APPROVER_CODES } from '../../lib/navigation';
import {
  KIND_LABEL,
  approve,
  listApprovals,
  listRules,
  reject,
  saveRule,
  type ApprovalRequest,
  type ApprovalRule,
} from '../../lib/approvals';
import { formatNpr } from '../../lib/reports';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const session = getSession();
const isOwner = !!session?.isOwner;
const readOnly = session?.accessMode === 'read_only';
const mayDecide = !readOnly && (isOwner || APPROVER_CODES.some((c) => can(session, c)));

let requests: ApprovalRequest[] = [];
let tab = 'pending';
let rejecting: number | null = null;

const message = (e: unknown) =>
  e instanceof ApiError ? e.message : 'Something went wrong. Please try again.';

function showError(text: string | null) {
  const el = $('ap-error');
  el.textContent = text ?? '';
  el.hidden = !text;
}

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : '';
}

function render() {
  for (const s of ['pending', 'approved', 'rejected'] as const) {
    $(`kpi-${s}`).textContent = String(requests.filter((r) => r.status === s).length);
  }

  $('ap-requests').hidden = tab === 'rules';
  $('ap-rules').hidden = tab !== 'rules';
  document
    .querySelectorAll<HTMLElement>('#ap-tabs button')
    .forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));

  if (tab === 'rules') return;

  const rows = requests.filter((r) => r.status === tab);
  $('ap-list').innerHTML = rows.length
    ? rows
        .map((r) => {
          const note =
            r.status === 'rejected' && r.rejectionReason
              ? ` · “${esc(r.rejectionReason)}”`
              : r.status === 'approved'
                ? r.usedAt
                  ? ' · used'
                  : ' · not used yet'
                : '';
          const actions =
            r.status === 'pending' && mayDecide
              ? `<div class="ap-actions">
                   <button type="button" class="btn-ghost-sm" data-reject="${r.id}">Reject</button>
                   <button type="button" class="btn-primary-sm" data-approve="${r.id}">Approve</button>
                 </div>`
              : `<span class="ap-badge is-${r.status}">${r.status}</span>`;
          return `<article class="ap-item">
            <div>
              <h4>${esc(r.kindLabel)} · <span class="ap-amount">${esc(formatNpr(r.amount))}</span></h4>
              <div class="ap-meta">${esc(r.summary) || '—'}</div>
              <div class="ap-meta">Asked by ${esc(r.createdByName)} · ${esc(when(r.createdAt))}${
                r.decidedByName ? ` · decided by ${esc(r.decidedByName)}` : ''
              }${note}</div>
            </div>${actions}</article>`;
        })
        .join('')
    : `<div class="ap-empty">Nothing here.</div>`;
}

async function load() {
  try {
    requests = await listApprovals();
    showError(null);
  } catch (e) {
    showError(message(e));
  }
  render();
}

async function decide(fn: () => Promise<unknown>) {
  try {
    await fn();
    showError(null);
    await load();
  } catch (e) {
    showError(message(e));
    await load();
  }
}

$('ap-tabs').addEventListener('click', (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLElement>('button[data-tab]');
  if (!b) return;
  tab = b.dataset.tab!;
  render();
});

$('ap-list').addEventListener('click', (ev) => {
  const el = ev.target as HTMLElement;
  const yes = el.closest<HTMLElement>('[data-approve]');
  const no = el.closest<HTMLElement>('[data-reject]');
  if (yes) void decide(() => approve(Number(yes.dataset.approve)));
  if (no) {
    rejecting = Number(no.dataset.reject);
    ($('ap-reject-reason') as unknown as HTMLTextAreaElement).value = '';
    $('ap-reject-error').hidden = true;
    ($('ap-reject-dialog') as unknown as HTMLDialogElement).showModal();
  }
});

$('ap-reject-cancel').addEventListener('click', () =>
  ($('ap-reject-dialog') as unknown as HTMLDialogElement).close(),
);
$('ap-reject-confirm').addEventListener('click', async () => {
  const reason = ($('ap-reject-reason') as unknown as HTMLTextAreaElement).value.trim();
  if (!reason) {
    $('ap-reject-error').textContent = 'Say why it is rejected.';
    $('ap-reject-error').hidden = false;
    return;
  }
  ($('ap-reject-dialog') as unknown as HTMLDialogElement).close();
  if (rejecting != null) await decide(() => reject(rejecting!, reason));
});

// ---------- rules (owner) ----------
async function loadRules() {
  const list = $('ap-rules-list');
  try {
    const rules = await listRules();
    list.innerHTML = rules
      .map(
        (r) => `<div class="ap-rule" data-kind="${r.kind}">
          <div><strong>${esc(KIND_LABEL[r.kind])}</strong>
            <div class="ap-meta">${r.isActive ? 'Needs approval from' : 'Off — no approval needed'}</div></div>
          <input type="number" min="0" step="0.01" value="${r.threshold}" aria-label="Threshold" data-field="threshold" ${readOnly ? 'disabled' : ''}>
          <label><input type="checkbox" data-field="active" ${r.isActive ? 'checked' : ''} ${readOnly ? 'disabled' : ''}> On</label>
          <label><input type="checkbox" data-field="self" ${r.allowSelfApproval ? 'checked' : ''} ${readOnly ? 'disabled' : ''}> Self-approval</label>
        </div>`,
      )
      .join('');
  } catch (e) {
    showError(message(e));
  }
}

$('ap-rules-list').addEventListener('change', async (ev) => {
  const row = (ev.target as HTMLElement).closest<HTMLElement>('.ap-rule');
  if (!row || readOnly) return;
  const rule: ApprovalRule = {
    id: null,
    kind: row.dataset.kind as ApprovalRule['kind'],
    threshold: Number((row.querySelector('[data-field=threshold]') as HTMLInputElement).value || 0),
    isActive: (row.querySelector('[data-field=active]') as HTMLInputElement).checked,
    allowSelfApproval: (row.querySelector('[data-field=self]') as HTMLInputElement).checked,
  };
  try {
    await saveRule(rule);
    showError(null);
  } catch (e) {
    showError(message(e));
  }
  await loadRules();
});

if (isOwner || can(session, 'finance.manage_rules')) {
  $('ap-rules-tab').hidden = false;
  void loadRules();
  if (window.location.hash === '#rules') tab = 'rules';
}
void load();
