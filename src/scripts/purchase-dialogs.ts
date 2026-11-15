import { ApiError } from '../lib/api';
import type { Supplier } from '../lib/suppliers';
import type { StockItem } from '../lib/inventory';
import {
  createPurchase,
  updatePurchase,
  receivePurchase,
  addPayment,
  createReturn,
  previewTotals,
  formatNpr,
  formatQty,
  type Purchase,
  type PayMethod,
} from '../lib/purchases';

/**
 * Dialogs shared by the purchase list and detail pages (new/edit purchase,
 * receive goods, record payment, return goods, reason prompt).
 * Markup lives in components/purchase/PurchaseDialogs.astro.
 */

export interface PurchaseDialogHooks {
  getProducts: () => StockItem[];
  getSuppliers: () => Supplier[];
  /** Called after any change is saved; id is the purchase that changed. */
  onChanged: (purchaseId?: number) => void | Promise<void>;
}

let hooks: PurchaseDialogHooks = {
  getProducts: () => [],
  getSuppliers: () => [],
  onChanged: () => {},
};

export function configurePurchaseDialogs(next: PurchaseDialogHooks): void {
  hooks = next;
}

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
export const val = (id: string) => $<HTMLInputElement>(id)?.value ?? '';
export const today = () => new Date().toLocaleDateString('en-CA');

export function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const FIELD_LABELS: Record<string, string> = {
  supplier: 'Supplier',
  bill_no: 'Bill no',
  purchase_date: 'Date',
  due_date: 'Payment due date',
  discount_amount: 'Discount',
  vat_rate: 'VAT',
  freight_amount: 'Freight',
  amount: 'Amount',
  method: 'Method',
  reason: 'Reason',
  paid_on: 'Paid on',
  received_on: 'Received on',
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

export const dlg = (id: string) => $<HTMLDialogElement>(id)!;
document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((b) =>
  b.addEventListener('click', () => dlg(b.dataset.close!).close()),
);

/** Runs a save: disables the button, shows errors in the dialog, closes on success. */
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

// ---- Line editor (shared by purchase form and replacement goods) ---

export function productOptions(selectedId?: number): string {
  return (
    `<option value="">Choose product…</option>` +
    hooks.getProducts()
      .map((p) => `<option value="${p.productId}" ${p.productId === selectedId ? 'selected' : ''}>${esc(p.stockNo)} · ${esc(p.name)}</option>`)
      .join('')
  );
}

export function addLineRow(
  container: HTMLElement,
  opts: { price: boolean; productId?: number; quantity?: number; unitPrice?: number; onChange?: () => void },
): void {
  const row = document.createElement('div');
  row.className = 'pu-line';
  row.innerHTML = `
    <select class="ln-product" aria-label="Product">${productOptions(opts.productId)}</select>
    <input class="ln-qty" type="number" min="0.001" step="0.001" value="${opts.quantity ?? 1}" aria-label="Quantity" />
    ${opts.price ? `<input class="ln-price" type="number" min="0" step="0.01" value="${opts.unitPrice ?? 0}" aria-label="Unit price" />` : ''}
    <button type="button" class="btn-link is-danger ln-remove" aria-label="Remove">✕</button>`;
  container.appendChild(row);
  const sel = row.querySelector<HTMLSelectElement>('.ln-product')!;
  sel.addEventListener('change', () => {
    const prod = hooks.getProducts().find((p) => p.productId === Number(sel.value));
    const price = row.querySelector<HTMLInputElement>('.ln-price');
    if (prod && price) price.value = String(prod.purchasePrice);
    opts.onChange?.();
  });
  row.querySelectorAll('input').forEach((i) => i.addEventListener('input', () => opts.onChange?.()));
  row.querySelector('.ln-remove')!.addEventListener('click', () => {
    row.remove();
    opts.onChange?.();
  });
}

export function readLines(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('.pu-line'))
    .map((row) => ({
      productId: Number(row.querySelector<HTMLSelectElement>('.ln-product')!.value),
      quantity: Number(row.querySelector<HTMLInputElement>('.ln-qty')!.value),
      unitPrice: Number(row.querySelector<HTMLInputElement>('.ln-price')?.value ?? 0),
    }))
    .filter((l) => l.productId);
}

// ---- Purchase form -------------------------------------------------

function updateTotals(): void {
  const t = previewTotals(readLines($('pf-lines')!), Number(val('pf-discount')) || 0, Number(val('pf-vat')) || 0, Number(val('pf-freight')) || 0);
  $('pf-totals')!.innerHTML = `
    <div><dt>Subtotal</dt><dd>${formatNpr(t.subtotal)}</dd></div>
    <div><dt>VAT</dt><dd>${formatNpr(t.vat)}</dd></div>
    <div class="strong"><dt>Net total (preview)</dt><dd>${formatNpr(t.net)}</dd></div>`;
}

export function openForm(p?: Purchase): void {
  $('pf-title')!.textContent = p ? `Edit ${p.purchaseNo}` : 'New purchase';
  $<HTMLInputElement>('pf-id')!.value = p ? String(p.id) : '';
  const sup = $<HTMLSelectElement>('pf-supplier')!;
  sup.innerHTML =
    `<option value="">Choose supplier…</option>` +
    hooks.getSuppliers().filter((s) => s.isActive || s.id === p?.supplierId)
      .map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  sup.value = p ? String(p.supplierId) : '';
  $<HTMLInputElement>('pf-bill')!.value = p?.billNo ?? '';
  $<HTMLInputElement>('pf-date')!.value = p?.purchaseDate ?? today();
  $<HTMLInputElement>('pf-due')!.value = p?.dueDate ?? '';
  $<HTMLInputElement>('pf-notes')!.value = p?.notes ?? '';
  $<HTMLInputElement>('pf-discount')!.value = String(p?.discount ?? 0);
  $<HTMLInputElement>('pf-vat')!.value = String(p?.vatRate ?? 0);
  $<HTMLInputElement>('pf-freight')!.value = String(p?.freight ?? 0);
  const box = $('pf-lines')!;
  box.innerHTML = '';
  if (p) p.lines.forEach((l) => addLineRow(box, { price: true, productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, onChange: updateTotals }));
  else addLineRow(box, { price: true, onChange: updateTotals });
  updateTotals();
  showError('pf-error', null);
  dlg('dlg-form').showModal();
}

$('pf-add-line')?.addEventListener('click', () => addLineRow($('pf-lines')!, { price: true, onChange: updateTotals }));
for (const id of ['pf-discount', 'pf-vat', 'pf-freight']) $(id)?.addEventListener('input', updateTotals);

$('form-purchase')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const lines = readLines($('pf-lines')!);
  if (lines.length === 0) {
    showError('pf-error', 'Add at least one item.');
    return;
  }
  if (lines.some((l) => !(l.quantity > 0))) {
    showError('pf-error', 'Every item needs a quantity above zero.');
    return;
  }
  const id = Number(val('pf-id')) || 0;
  const input = {
    supplierId: Number(val('pf-supplier')),
    billNo: val('pf-bill'),
    purchaseDate: val('pf-date'),
    dueDate: val('pf-due') || null,
    discount: Number(val('pf-discount')) || 0,
    vatRate: Number(val('pf-vat')) || 0,
    freight: Number(val('pf-freight')) || 0,
    notes: val('pf-notes'),
    lines,
  };
  void submit('pf-save', 'pf-error', 'dlg-form', async () => {
    const saved = id ? await updatePurchase(id, input) : await createPurchase(input);
    await hooks.onChanged(saved.id);
  });
});

// ---- Receive -------------------------------------------------------

export function openReceive(p: Purchase): void {
  $('rc-sub')!.textContent = `${p.purchaseNo} · ${p.supplierName}. Change a quantity for a part delivery. If some arrived damaged, tick the box and say how many: those go to damaged stock, the rest to good stock.`;
  $('rc-lines')!.innerHTML = p.lines
    .filter((l) => l.remainingQuantity > 0)
    .map((l) => `<div class="pu-rc-item" data-line="${l.id}" data-max="${l.remainingQuantity}">
        <div class="pu-line pu-line-rc">
          <span>${esc(l.productName)} <span class="muted">(still to come ${formatQty(l.remainingQuantity)} ${esc(l.unit)})</span></span>
          <input type="number" class="rc-qty" min="0" max="${l.remainingQuantity}" step="0.001" value="${l.remainingQuantity}" aria-label="Quantity received" />
        </div>
        <label class="pu-check"><input type="checkbox" class="rc-dmg-on" /> Some arrived damaged</label>
        <div class="pu-rc-dmg" hidden>
          <label class="pu-field"><span>How many are damaged?</span>
            <input type="number" class="rc-dmg-qty" min="0.001" step="0.001" value="1" />
          </label>
          <small class="rc-dmg-hint muted"></small>
        </div>
      </div>`).join('');

  const hint = (item: HTMLElement) => {
    const qty = Number(item.querySelector<HTMLInputElement>('.rc-qty')!.value) || 0;
    const dmg = Number(item.querySelector<HTMLInputElement>('.rc-dmg-qty')!.value) || 0;
    const good = Math.max(0, qty - dmg);
    item.querySelector('.rc-dmg-hint')!.textContent = `${formatQty(good)} to good stock, ${formatQty(Math.min(dmg, qty))} to damaged stock`;
  };

  document.querySelectorAll<HTMLElement>('#rc-lines .pu-rc-item').forEach((item) => {
    const on = item.querySelector<HTMLInputElement>('.rc-dmg-on')!;
    const box = item.querySelector<HTMLElement>('.pu-rc-dmg')!;
    on.addEventListener('change', () => {
      box.hidden = !on.checked;
      hint(item);
    });
    item.querySelectorAll('.rc-qty, .rc-dmg-qty').forEach((i) => i.addEventListener('input', () => hint(item)));
    hint(item);
  });

  $<HTMLInputElement>('rc-date')!.value = today();
  $<HTMLInputElement>('rc-notes')!.value = '';
  showError('rc-error', null);
  $('form-receive')!.dataset.id = String(p.id);
  dlg('dlg-receive').showModal();
}

$('form-receive')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = Number($('form-receive')!.dataset.id);
  const rows = Array.from(document.querySelectorAll<HTMLElement>('#rc-lines .pu-rc-item'));
  const lines = rows
    .map((r) => {
      const quantity = Number(r.querySelector<HTMLInputElement>('.rc-qty')!.value) || 0;
      const marked = r.querySelector<HTMLInputElement>('.rc-dmg-on')!.checked;
      const damaged = marked ? Number(r.querySelector<HTMLInputElement>('.rc-dmg-qty')!.value) || 0 : 0;
      return { lineId: Number(r.dataset.line), quantity, damaged, marked, max: Number(r.dataset.max) };
    })
    .filter((l) => l.quantity > 0);
  if (lines.length === 0) {
    showError('rc-error', 'Enter a quantity for at least one item.');
    return;
  }
  for (const l of lines) {
    if (l.marked && l.damaged <= 0) {
      showError('rc-error', 'Enter how many are damaged, or untick "Some arrived damaged".');
      return;
    }
    if (l.damaged > l.quantity) {
      showError('rc-error', 'Damaged cannot be more than the quantity received.');
      return;
    }
  }
  const everything = lines.length === rows.length && lines.every((l) => l.quantity === l.max && l.damaged === 0);
  void submit('rc-save', 'rc-error', 'dlg-receive', async () => {
    await receivePurchase(id, {
      lines: everything ? undefined : lines.map((l) => ({ lineId: l.lineId, quantity: l.quantity, damagedQuantity: l.damaged })),
      receivedOn: val('rc-date'),
      notes: val('rc-notes').trim(),
    });
    await hooks.onChanged(id);
  });
});

// ---- Payment -------------------------------------------------------

export function openPay(p: Purchase): void {
  $('py-sub')!.textContent = `${p.purchaseNo} · ${p.supplierName} · due ${formatNpr(p.remaining)}`;
  $<HTMLInputElement>('py-amount')!.value = String(p.remaining);
  $<HTMLInputElement>('py-amount')!.max = String(p.remaining);
  $<HTMLSelectElement>('py-method')!.value = 'cash';
  $<HTMLInputElement>('py-date')!.value = today();
  $<HTMLInputElement>('py-ref')!.value = '';
  showError('py-error', null);
  $('form-pay')!.dataset.id = String(p.id);
  dlg('dlg-pay').showModal();
}

$('form-pay')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = Number($('form-pay')!.dataset.id);
  void submit('py-save', 'py-error', 'dlg-pay', async () => {
    await addPayment({
      purchaseId: id,
      amount: Number(val('py-amount')),
      method: val('py-method') as PayMethod,
      paidOn: val('py-date'),
      reference: val('py-ref'),
    });
    await hooks.onChanged(id);
  });
});

// ---- Return --------------------------------------------------------

export function openReturn(p: Purchase): void {
  $('rt-sub')!.textContent = `${p.purchaseNo} · ${p.supplierName}. Only goods that arrived can be sent back.`;
  $('rt-lines')!.innerHTML = p.lines
    .filter((l) => l.returnableQuantity > 0)
    .map((l) => `<div class="pu-line pu-line-rt" data-line="${l.id}">
        <span>${esc(l.productName)} <span class="muted">(can return ${formatQty(l.returnableQuantity)} ${esc(l.unit)})</span></span>
        <input type="number" class="rt-qty" min="0" max="${l.returnableQuantity}" step="0.001" value="0" />
        <select class="rt-cond"><option value="good">From good stock</option><option value="damaged">From damaged stock</option></select>
      </div>`).join('');
  $<HTMLInputElement>('rt-reason')!.value = '';
  showError('rt-error', null);
  $('form-return')!.dataset.id = String(p.id);
  dlg('dlg-return').showModal();
}

$('form-return')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = Number($('form-return')!.dataset.id);
  const lines = Array.from(document.querySelectorAll<HTMLElement>('#rt-lines .pu-line-rt'))
    .map((r) => ({
      lineId: Number(r.dataset.line),
      quantity: Number(r.querySelector<HTMLInputElement>('.rt-qty')!.value) || 0,
      condition: r.querySelector<HTMLSelectElement>('.rt-cond')!.value as 'good' | 'damaged',
    }))
    .filter((l) => l.quantity > 0);
  if (lines.length === 0) {
    showError('rt-error', 'Enter a quantity to return.');
    return;
  }
  void submit('rt-save', 'rt-error', 'dlg-return', async () => {
    await createReturn({ purchaseId: id, reason: val('rt-reason'), lines });
    await hooks.onChanged(id);
  });
});

