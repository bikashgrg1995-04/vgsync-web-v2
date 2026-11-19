import { statementUrl } from '../../lib/statements';
import { getSession, refreshProfile } from '../../lib/auth';
import { ApiError } from '../../lib/api';
import {
  listSuppliers,
  createSupplier,
  updateSupplier,
  setSupplierActive,
  getSupplierSummary,
  formatNpr,
  type Supplier,
  type SupplierInput,
} from '../../lib/suppliers';

if (!getSession()) window.location.replace('/');

let suppliers: Supplier[] = [];
let selectedId: number | null = null;
let canWrite = true;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  contact_person: 'Contact person',
  phone: 'Phone',
  email: 'Email',
  address: 'Address',
  pan_number: 'PAN',
  notes: 'Notes',
  is_active: 'Status',
};

function describe(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  const entries = Object.entries(error.fields);
  if (entries.length > 0 && error.status === 400) {
    return entries.map(([key, msg]) => `${FIELD_LABELS[key] ?? key}: ${msg}`).join(' ');
  }
  return error.message;
}

function showLoadError(message: string | null): void {
  const el = $('sup-load-error');
  if (!el) return;
  el.hidden = !message;
  el.textContent = message ?? '';
}

function filtered(): Supplier[] {
  const q = ($<HTMLInputElement>('sup-search')?.value ?? '').trim().toLowerCase();
  const st = $<HTMLSelectElement>('sup-status-filter')?.value ?? '';
  return suppliers.filter((s) => {
    if (st === 'active' && !s.isActive) return false;
    if (st === 'inactive' && s.isActive) return false;
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.phone.includes(q) ||
      s.pan.toLowerCase().includes(q) ||
      s.contactPerson.toLowerCase().includes(q)
    );
  });
}

function setText(id: string, value: string): void {
  const el = $(id);
  if (el) el.textContent = value || '—';
}

function renderKpis(): void {
  const s = getSupplierSummary(suppliers);
  setText('kpi-total', String(s.total));
  setText('kpi-active', String(s.active));
  setText('kpi-payable', formatNpr(s.payable));
  setText('kpi-inactive', String(s.inactive));
}

function renderTable(): void {
  const tbody = $('sup-tbody');
  const count = $('sup-count');
  if (!tbody) return;
  const rows = filtered();
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="sup-empty">No suppliers found.</td></tr>`;
    if (count) count.textContent = '0 suppliers';
    return;
  }
  tbody.innerHTML = rows
    .map((s) => {
      const active = s.id === selectedId ? ' is-selected' : '';
      const badge = s.isActive ? 'active' : 'inactive';
      return `<tr class="sup-row${active}" data-id="${s.id}">
        <td><strong>${esc(s.name)}</strong></td>
        <td>${esc(s.contactPerson) || '—'}</td>
        <td>${esc(s.phone) || '—'}</td>
        <td class="num">${formatNpr(s.creditToPay)}</td>
        <td><span class="sup-badge sup-badge-${badge}">${s.isActive ? 'Active' : 'Inactive'}</span></td>
      </tr>`;
    })
    .join('');
  if (count) count.textContent = `${rows.length} supplier${rows.length === 1 ? '' : 's'} · active branch only`;

  tbody.querySelectorAll<HTMLTableRowElement>('.sup-row').forEach((row) => {
    row.addEventListener('click', () => {
      selectedId = Number(row.dataset.id) || null;
      renderTable();
      renderDetail();
    });
  });
}

function selected(): Supplier | null {
  return suppliers.find((s) => s.id === selectedId) ?? null;
}

function renderDetail(): void {
  const empty = $('sup-detail-empty');
  const body = $('sup-detail-body');
  const s = selected();
  if (!s) {
    selectedId = null;
    empty?.removeAttribute('hidden');
    body?.setAttribute('hidden', '');
    return;
  }
  empty?.setAttribute('hidden', '');
  body?.removeAttribute('hidden');

  setText('d-code', `Supplier #${s.id}`);
  setText('d-name', s.name);
  setText('d-contact', s.contactPerson);
  setText('d-phone', s.phone);
  setText('d-email', s.email);
  setText('d-address', s.address);
  setText('d-pan', s.pan);
  setText('d-credit-to-pay', formatNpr(s.creditToPay));
  setText('d-outstanding', formatNpr(s.outstanding));
  setText('d-on-order', formatNpr(s.toPayOnOrder));
  setText('d-advance', formatNpr(s.advancePaid));
  setText('d-credit-to-receive', formatNpr(s.creditToReceive));
  setText('d-total', formatNpr(s.totalPurchased));
  setText('d-stock-due', String(s.stockToReceive));
  setText('d-stock-pending', String(s.stockPendingDelivery));
  setText('d-notes', s.notes);
  setText(
    'd-meta',
    `Created ${new Date(s.createdAt).toLocaleDateString()} · Updated ${new Date(s.updatedAt).toLocaleDateString()}`,
  );

  const st = $('d-status');
  if (st) {
    st.textContent = s.isActive ? 'Active' : 'Inactive';
    st.className = `sup-badge sup-badge-${s.isActive ? 'active' : 'inactive'}`;
  }

  const toggle = $('sup-toggle');
  if (toggle) toggle.textContent = s.isActive ? 'Deactivate' : 'Reactivate';
}

function applyWriteAccess(): void {
  const session = getSession();
  // A company owner has read-only access inside a branch.
  canWrite = session?.accessMode !== 'read_only';
  for (const id of ['sup-add', 'sup-edit', 'sup-toggle']) {
    const el = $(id);
    if (el) el.hidden = !canWrite;
  }
}

async function reload(): Promise<void> {
  const sess = getSession();
  const scope = $('sup-scope');
  if (scope && sess) scope.textContent = `${sess.activeBranchName} (${sess.activeBranchCode})`;
  applyWriteAccess();

  try {
    suppliers = await listSuppliers();
    showLoadError(canWrite ? null : 'Read-only: you are viewing this branch from Head Office.');
  } catch (error) {
    suppliers = [];
    showLoadError(describe(error));
  }

  if (selectedId && !selected()) selectedId = null;
  renderKpis();
  renderTable();
  renderDetail();
}

const dialog = $<HTMLDialogElement>('sup-dialog');
const form = $<HTMLFormElement>('sup-form');

const input = (id: string) => $<HTMLInputElement>(id)!;

function openForm(edit?: Supplier): void {
  setText('sup-form-title', edit ? 'Edit supplier' : 'New supplier');
  input('f-id').value = edit ? String(edit.id) : '';
  input('f-name').value = edit?.name ?? '';
  $<HTMLSelectElement>('f-status')!.value = edit && !edit.isActive ? 'inactive' : 'active';
  input('f-contact').value = edit?.contactPerson ?? '';
  input('f-phone').value = edit?.phone ?? '';
  input('f-email').value = edit?.email ?? '';
  input('f-address').value = edit?.address ?? '';
  input('f-pan').value = edit?.pan ?? '';
  input('f-notes').value = edit?.notes ?? '';
  const err = $('f-error');
  if (err) err.hidden = true;
  dialog?.showModal();
}

$('sup-add')?.addEventListener('click', () => openForm());
$('sup-statement')?.addEventListener('click', () => {
  if (selectedId) window.location.href = statementUrl('supplier', selectedId);
});

$('sup-edit')?.addEventListener('click', () => {
  const s = selected();
  if (s) openForm(s);
});

$('sup-toggle')?.addEventListener('click', async () => {
  const s = selected();
  if (!s) return;
  const next = !s.isActive;
  if (!next && !confirm(`Deactivate ${s.name}? It will no longer be offered on new purchases.`)) return;

  const button = $<HTMLButtonElement>('sup-toggle')!;
  button.disabled = true;
  try {
    await setSupplierActive(s.id, next);
    await reload();
  } catch (error) {
    alert(describe(error));
  } finally {
    button.disabled = false;
  }
});

$('f-cancel')?.addEventListener('click', () => dialog?.close());

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('f-error');
  const save = $<HTMLButtonElement>('f-save');
  if (err) err.hidden = true;

  const id = Number(input('f-id').value) || null;
  const payload: SupplierInput = {
    name: input('f-name').value,
    isActive: $<HTMLSelectElement>('f-status')!.value === 'active',
    contactPerson: input('f-contact').value,
    phone: input('f-phone').value,
    email: input('f-email').value,
    address: input('f-address').value,
    pan: input('f-pan').value,
    notes: input('f-notes').value,
  };

  if (!payload.name.trim()) {
    if (err) {
      err.hidden = false;
      err.textContent = 'Name is required.';
    }
    return;
  }

  if (save) save.disabled = true;
  try {
    const saved = id ? await updateSupplier(id, payload) : await createSupplier(payload);
    selectedId = saved.id;
    dialog?.close();
    await reload();
  } catch (error) {
    if (err) {
      err.hidden = false;
      err.textContent = describe(error);
    }
  } finally {
    if (save) save.disabled = false;
  }
});

$('sup-search')?.addEventListener('input', () => renderTable());
$('sup-status-filter')?.addEventListener('change', () => renderTable());

void reload();
// Fresh role/branch access from the server, then re-apply it.
refreshProfile().then(applyWriteAccess).catch(() => {});
