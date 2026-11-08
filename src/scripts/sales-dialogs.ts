import { ApiError } from '../lib/api';
import type { Customer } from '../lib/customers';
import type { StockItem } from '../lib/inventory';
import {
  createSale, updateSale, addPayment, createReturn,
  previewTotals, previewFinance, formatNpr, formatQty,
  type Sale, type SaleType, type BikeUnit, type LocalProduct, type PayMethod, type SaleLineInput,
} from '../lib/sales';

/**
 * Dialogs shared by the sales list and detail pages (new/edit sale, record
 * payment, return goods, reason prompt). Markup lives in
 * components/sales/SalesDialogs.astro.
 */

export interface SalesDialogHooks {
  getProducts: () => StockItem[];
  getCustomers: () => Customer[];
  getBikes: () => BikeUnit[];
  getLocalProducts: () => LocalProduct[];
  /** Called after any change is saved; id is the sale that changed. */
  onChanged: (saleId?: number) => void | Promise<void>;
}

let hooks: SalesDialogHooks = {
  getProducts: () => [],
  getCustomers: () => [],
  getBikes: () => [],
  getLocalProducts: () => [],
  onChanged: () => {},
};

export function configureSalesDialogs(next: SalesDialogHooks): void {
  hooks = next;
}

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
export const val = (id: string) => $<HTMLInputElement>(id)?.value ?? '';
export const today = () => new Date().toLocaleDateString('en-CA');
export const dlg = (id: string) => $<HTMLDialogElement>(id)!;

export function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const FIELD_LABELS: Record<string, string> = {
  customer: 'Customer', sale_date: 'Date', discount_amount: 'Discount', vat_rate: 'VAT',
  down_payment: 'Down payment', emi_months: 'Months', emi_amount: 'EMI', first_emi_due: 'First EMI due',
  due_date: 'Due date', amount: 'Amount', method: 'Method', reason: 'Reason', paid_on: 'Paid on',
  chassis_no: 'Chassis no', engine_no: 'Engine no', name: 'Name', sale: 'Sale', note: 'Note',
  refund_method: 'Refund method',
};

function flatten(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(flatten).filter(Boolean).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(flatten).filter(Boolean).join(' ');
  return '';
}

export function describe(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  const entries = Object.entries(error.fields);
  if (entries.length > 0 && error.status === 400) {
    return entries
      .map(([k, v]) => (FIELD_LABELS[k] ? `${FIELD_LABELS[k]}: ${flatten(v)}` : flatten(v)))
      .join(' ');
  }
  return error.message;
}

export function showError(id: string, message: string | null): void {
  const el = $(id);
  if (!el) return;
  el.hidden = !message;
  el.textContent = message ?? '';
}

document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((b) =>
  b.addEventListener('click', () => dlg(b.dataset.close!).close()),
);

export async function submit(btnId: string, errId: string, dialogId: string, work: () => Promise<void>): Promise<void> {
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

export const badge = (cls: string, text: string) => `<span class="sa-badge sa-badge-${cls}">${esc(text)}</span>`;
export const customerLabel = (s: Sale) => esc(s.customerId ? s.customerName : s.walkInName || 'Walk-in');

// ---- Reason dialog -------------------------------------------------

let reasonHandler: ((reason: string) => Promise<void>) | null = null;
let reasonAfter: number | undefined;

export function openReason(title: string, sub: string, handler: (reason: string) => Promise<void>, afterId?: number): void {
  $('rs-title')!.textContent = title;
  $('rs-sub')!.textContent = sub;
  $<HTMLInputElement>('rs-text')!.value = '';
  showError('rs-error', null);
  reasonHandler = handler;
  reasonAfter = afterId;
  dlg('dlg-reason').showModal();
}

$('form-reason')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const reason = val('rs-text').trim();
  if (!reason || !reasonHandler) return;
  void submit('rs-save', 'rs-error', 'dlg-reason', async () => {
    await reasonHandler!(reason);
    await hooks.onChanged(reasonAfter);
  });
});

// ---- Line editor ---------------------------------------------------

export type Kind = 'product' | 'local' | 'service' | 'bike';
const KIND_LABEL: Record<Kind, string> = { product: 'Product', local: 'Local product', service: 'Service charge', bike: 'Bike' };

function kindsFor(type: SaleType): Kind[] {
  if (type === 'bike') return ['bike'];
  if (type === 'maintenance') return ['product', 'local', 'service'];
  return ['product', 'local'];
}

export function itemOptions(kind: Kind, selectedId?: number): string {
  const pick = (id: number) => (id === selectedId ? 'selected' : '');
  if (kind === 'product') {
    return `<option value="">Choose product…</option>` + hooks.getProducts()
      .map((p) => `<option value="${p.productId}" ${pick(p.productId)}>${esc(p.stockNo)} · ${esc(p.name)} (${formatQty(p.quantity)} in stock)</option>`).join('');
  }
  if (kind === 'local') {
    return `<option value="">Choose local product…</option>` + hooks.getLocalProducts().filter((p) => p.isActive)
      .map((p) => `<option value="${p.id}" ${pick(p.id)}>${esc(p.name)}</option>`).join('');
  }
  return `<option value="">Choose bike…</option>` + hooks.getBikes()
    .map((b) => `<option value="${b.id}" ${pick(b.id)}>${esc(b.productName)} · ${esc(b.chassisNo)}${b.color ? ` · ${esc(b.color)}` : ''}</option>`).join('');
}

export function defaultPrice(kind: Kind, id: number): number {
  if (kind === 'product') return hooks.getProducts().find((p) => p.productId === id)?.salePrice ?? 0;
  if (kind === 'local') return hooks.getLocalProducts().find((p) => p.id === id)?.salePrice ?? 0;
  if (kind === 'bike') {
    const bike = hooks.getBikes().find((b) => b.id === id);
    return bike ? hooks.getProducts().find((p) => p.productId === bike.productId)?.salePrice ?? 0 : 0;
  }
  return 0;
}

export function addSaleLine(container: HTMLElement, type: SaleType, preset: { kind?: Kind; id?: number; description?: string; quantity?: number; unitPrice?: number } = {}, onChange?: () => void): void {
  const kinds = kindsFor(type);
  const kind = preset.kind && kinds.includes(preset.kind) ? preset.kind : kinds[0];
  const row = document.createElement('div');
  row.className = 'sa-line sa-line-sale';
  row.dataset.kind = kind;
  row.innerHTML = `
    <select class="ln-kind" aria-label="Kind" ${kinds.length === 1 ? 'hidden' : ''}>
      ${kinds.map((k) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${KIND_LABEL[k]}</option>`).join('')}
    </select>
    <span class="ln-item-wrap"></span>
    <input class="ln-qty" type="number" min="0.001" step="0.001" value="${preset.quantity ?? 1}" aria-label="Quantity" />
    <input class="ln-price" type="number" min="0" step="0.01" value="${preset.unitPrice ?? 0}" aria-label="Unit price" />
    <button type="button" class="btn-link is-danger ln-remove" aria-label="Remove">✕</button>`;
  container.appendChild(row);

  const renderItem = (k: Kind, id?: number, description?: string) => {
    row.dataset.kind = k;
    const wrap = row.querySelector<HTMLElement>('.ln-item-wrap')!;
    wrap.innerHTML = k === 'service'
      ? `<input class="ln-desc" type="text" maxlength="200" placeholder="Service charge, e.g. Labour" value="${esc(description ?? '')}" />`
      : `<select class="ln-item" aria-label="Item">${itemOptions(k, id)}</select>`;
    row.querySelector<HTMLInputElement>('.ln-qty')!.hidden = k === 'bike';
    wrap.querySelector('.ln-item')?.addEventListener('change', (ev) => {
      const v = Number((ev.target as HTMLSelectElement).value);
      if (v) row.querySelector<HTMLInputElement>('.ln-price')!.value = String(defaultPrice(k, v));
      onChange?.();
    });
    wrap.querySelector('.ln-desc')?.addEventListener('input', () => onChange?.());
  };
  renderItem(kind, preset.id, preset.description);

  row.querySelector('.ln-kind')!.addEventListener('change', (ev) => {
    renderItem((ev.target as HTMLSelectElement).value as Kind);
    onChange?.();
  });
  row.querySelectorAll('input').forEach((i) => i.addEventListener('input', () => onChange?.()));
  row.querySelector('.ln-remove')!.addEventListener('click', () => { row.remove(); onChange?.(); });
}

export function readSaleLines(container: HTMLElement): SaleLineInput[] {
  const out: SaleLineInput[] = [];
  container.querySelectorAll<HTMLElement>('.sa-line').forEach((row) => {
    const kind = row.dataset.kind as Kind;
    const id = Number(row.querySelector<HTMLSelectElement>('.ln-item')?.value) || 0;
    const quantity = Number(row.querySelector<HTMLInputElement>('.ln-qty')!.value);
    const unitPrice = Number(row.querySelector<HTMLInputElement>('.ln-price')!.value);
    if (kind === 'service') {
      const description = row.querySelector<HTMLInputElement>('.ln-desc')!.value.trim();
      if (description) out.push({ description, quantity, unitPrice });
    } else if (id) {
      if (kind === 'bike') out.push({ bikeUnitId: id, unitPrice });
      else if (kind === 'local') out.push({ localProductId: id, quantity, unitPrice });
      else out.push({ productId: id, quantity, unitPrice });
    }
  });
  return out;
}

// ---- Sale form -----------------------------------------------------

const formType = () => val('sf-type') as SaleType;

export function updateTotals(): void {
  const lines = readSaleLines($('sf-lines')!).map((l) => ({ quantity: l.quantity ?? 1, unitPrice: l.unitPrice ?? 0 }));
  const t = previewTotals(lines, Number(val('sf-discount')) || 0, Number(val('sf-vat')) || 0);
  let html = `
    <div><dt>Subtotal</dt><dd>${formatNpr(t.subtotal)}</dd></div>
    <div><dt>VAT</dt><dd>${formatNpr(t.vat)}</dd></div>
    <div class="strong"><dt>Net total (preview)</dt><dd>${formatNpr(t.net)}</dd></div>`;
  if (formType() === 'bike' && val('sf-mode') === 'emi') {
    const fc = previewFinance(t.net, Number(val('sf-down')) || 0, Number(val('sf-months')) || 0, Number(val('sf-emi')) || 0);
    html += `<div><dt>Finance charge (preview)</dt><dd>${formatNpr(fc)}</dd></div>
             <div class="strong"><dt>Amount due (preview)</dt><dd>${formatNpr(t.net + fc)}</dd></div>`;
  }
  $('sf-totals')!.innerHTML = html;
}

export function syncFormType(resetLines: boolean): void {
  const type = formType();
  $('sf-due-wrap')!.hidden = type === 'bike';
  $('sf-chassis-wrap')!.hidden = type !== 'maintenance';
  $('sf-reg-wrap')!.hidden = type !== 'maintenance';
  $('sf-emi-box')!.hidden = type !== 'bike';
  $('sf-add-line')!.hidden = type === 'bike';
  $('sf-emi-fields')!.hidden = !(type === 'bike' && val('sf-mode') === 'emi');
  if (resetLines) {
    const box = $('sf-lines')!;
    box.innerHTML = '';
    addSaleLine(box, type, {}, updateTotals);
  }
  updateTotals();
}

export function syncWalkIn(): void {
  $('sf-walkin-wrap')!.hidden = Boolean(val('sf-customer'));
}

export function openForm(s?: Sale): void {
  $('sf-title')!.textContent = s ? `Edit ${s.saleNo}` : 'New sale';
  $<HTMLInputElement>('sf-id')!.value = s ? String(s.id) : '';
  $<HTMLSelectElement>('sf-type')!.value = s?.saleType ?? 'stock';
  $<HTMLSelectElement>('sf-type')!.disabled = Boolean(s);
  $<HTMLInputElement>('sf-date')!.value = s?.saleDate ?? today();
  $<HTMLSelectElement>('sf-customer')!.innerHTML =
    `<option value="">Walk-in customer</option>` +
    hooks.getCustomers().filter((c) => c.isActive || c.id === s?.customerId).map((c) => `<option value="${c.id}">${esc(c.name)}${c.phone ? ` · ${esc(c.phone)}` : ''}</option>`).join('');
  $<HTMLSelectElement>('sf-customer')!.value = s?.customerId ? String(s.customerId) : '';
  $<HTMLInputElement>('sf-walkin')!.value = s?.walkInName ?? '';
  $<HTMLInputElement>('sf-due')!.value = s?.dueDate ?? '';
  $<HTMLInputElement>('sf-chassis')!.value = s?.vehicleChassisNo ?? '';
  $<HTMLInputElement>('sf-reg')!.value = s?.vehicleRegNo ?? '';
  $<HTMLInputElement>('sf-discount')!.value = String(s?.discount ?? 0);
  $<HTMLInputElement>('sf-vat')!.value = String(s?.vatRate ?? 0);
  $<HTMLSelectElement>('sf-mode')!.value = s?.paymentMode ?? 'full';
  $<HTMLInputElement>('sf-down')!.value = String(s?.downPayment ?? 0);
  $<HTMLInputElement>('sf-months')!.value = String(s?.emiMonths || 12);
  $<HTMLInputElement>('sf-emi')!.value = String(s?.emiAmount ?? 0);
  $<HTMLInputElement>('sf-first')!.value = s?.firstEmiDue ?? '';
  $<HTMLInputElement>('sf-notes')!.value = s?.notes ?? '';

  const box = $('sf-lines')!;
  box.innerHTML = '';
  if (s) {
    s.lines.forEach((l) => {
      const kind: Kind = l.bikeUnitId ? 'bike' : l.localProductId ? 'local' : l.productId ? 'product' : 'service';
      addSaleLine(box, s.saleType, { kind, id: l.bikeUnitId ?? l.localProductId ?? l.productId ?? undefined, description: kind === 'service' ? l.name : '', quantity: l.quantity, unitPrice: l.unitPrice }, updateTotals);
    });
  }
  syncFormType(!s);
  syncWalkIn();
  showError('sf-error', null);
  dlg('dlg-form').showModal();
}

$('sf-type')?.addEventListener('change', () => syncFormType(true));
$('sf-mode')?.addEventListener('change', () => syncFormType(false));
$('sf-customer')?.addEventListener('change', syncWalkIn);
$('sf-add-line')?.addEventListener('click', () => addSaleLine($('sf-lines')!, formType(), {}, updateTotals));
for (const id of ['sf-discount', 'sf-vat', 'sf-down', 'sf-months', 'sf-emi']) $(id)?.addEventListener('input', updateTotals);

$('form-sale')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const lines = readSaleLines($('sf-lines')!);
  if (lines.length === 0) {
    showError('sf-error', 'Add at least one item.');
    return;
  }
  const id = Number(val('sf-id')) || 0;
  const type = formType();
  const customerId = Number(val('sf-customer')) || null;
  const input = {
    saleType: type,
    customerId,
    walkInName: customerId ? '' : val('sf-walkin'),
    saleDate: val('sf-date'),
    discount: Number(val('sf-discount')) || 0,
    vatRate: Number(val('sf-vat')) || 0,
    paymentMode: (val('sf-mode') || 'full') as 'full' | 'emi',
    downPayment: Number(val('sf-down')) || 0,
    emiMonths: Number(val('sf-months')) || undefined,
    emiAmount: Number(val('sf-emi')) || 0,
    firstEmiDue: val('sf-first'),
    dueDate: val('sf-due'),
    vehicleChassisNo: val('sf-chassis'),
    vehicleRegNo: val('sf-reg'),
    notes: val('sf-notes'),
    lines,
  };
  void submit('sf-save', 'sf-error', 'dlg-form', async () => {
    const saved = id ? await updateSale(id, input) : await createSale(input);
    await hooks.onChanged(saved.id);
  });
});

// ---- Payment -------------------------------------------------------

export function openPay(s: Sale): void {
  $('py-sub')!.textContent = `${s.invoiceNo || s.saleNo} · ${customerLabel(s)} · still to receive ${formatNpr(s.remaining)}${s.status === 'draft' ? ' (advance on a draft)' : ''}`;
  $<HTMLInputElement>('py-amount')!.value = String(s.remaining);
  $<HTMLSelectElement>('py-method')!.value = 'cash';
  $<HTMLInputElement>('py-date')!.value = today();
  $<HTMLInputElement>('py-ref')!.value = '';
  showError('py-error', null);
  $('form-pay')!.dataset.id = String(s.id);
  dlg('dlg-pay').showModal();
}

$('form-pay')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = Number($('form-pay')!.dataset.id);
  void submit('py-save', 'py-error', 'dlg-pay', async () => {
    await addPayment({ saleId: id, amount: Number(val('py-amount')), method: val('py-method') as PayMethod, paidOn: val('py-date'), reference: val('py-ref') });
    await hooks.onChanged(id);
  });
});

// ---- Return --------------------------------------------------------

export function openReturn(s: Sale): void {
  $('rt-sub')!.textContent = `${s.invoiceNo} · ${customerLabel(s)}. Goods go back into good stock.`;
  $('rt-lines')!.innerHTML = s.lines
    .filter((l) => l.returnableQuantity > 0)
    .map((l) => `<div class="sa-line sa-line-rt" data-line="${l.id}">
        <span>${esc(l.name)} <span class="muted">(can return ${formatQty(l.returnableQuantity)})</span></span>
        <input type="number" class="rt-qty" min="0" max="${l.returnableQuantity}" step="0.001" value="0" />
      </div>`).join('');
  $<HTMLInputElement>('rt-reason')!.value = '';
  $('rt-refund-wrap')!.hidden = Boolean(s.customerId);
  showError('rt-error', null);
  $('form-return')!.dataset.id = String(s.id);
  $('form-return')!.dataset.walkin = s.customerId ? '' : '1';
  dlg('dlg-return').showModal();
}

$('form-return')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = $('form-return')!;
  const id = Number(form.dataset.id);
  const lines = Array.from(document.querySelectorAll<HTMLElement>('#rt-lines .sa-line-rt'))
    .map((r) => ({ lineId: Number(r.dataset.line), quantity: Number(r.querySelector<HTMLInputElement>('.rt-qty')!.value) || 0 }))
    .filter((l) => l.quantity > 0);
  if (lines.length === 0) {
    showError('rt-error', 'Enter a quantity to return.');
    return;
  }
  void submit('rt-save', 'rt-error', 'dlg-return', async () => {
    await createReturn({ saleId: id, reason: val('rt-reason'), lines, refundMethod: form.dataset.walkin ? (val('rt-refund') as PayMethod) : undefined });
    await hooks.onChanged(id);
  });
});

