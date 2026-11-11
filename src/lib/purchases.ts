/**
 * Purchases, from the API (/api/v1/purchases/).
 *
 * A purchase is a draft until the goods arrive. Receiving (all at once or in
 * parts) is what adds stock. Totals are always worked out by the server; the
 * helpers here only preview them while the form is open.
 */

import { api } from './api';

export type PurchaseStatus = 'draft' | 'partial' | 'received' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';
export type PayMethod = 'cash' | 'bank' | 'online' | 'cheque';
export type CreditKind = 'refund' | 'replacement' | 'adjustment';

export interface PurchaseLine {
  id: number;
  productId: number;
  stockNo: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  receivedQuantity: number;
  remainingQuantity: number;
  returnedQuantity: number;
  returnableQuantity: number;
  /** Arrived damaged and not yet sent back. */
  damagedQuantity: number;
}

export interface PurchasePayment {
  id: number;
  purchaseId: number;
  purchaseNo: string;
  amount: number;
  paidOn: string;
  method: PayMethod;
  reference: string;
  notes: string;
  status: 'active' | 'void';
  voidReason: string;
}

export interface PurchaseReceipt {
  id: number;
  receivedOn: string;
  notes: string;
  items: { productName: string; quantity: number; damagedQuantity: number }[];
}

export interface Purchase {
  id: number;
  purchaseNo: string;
  supplierId: number;
  supplierName: string;
  billNo: string;
  purchaseDate: string;
  status: PurchaseStatus;
  lines: PurchaseLine[];
  subtotal: number;
  discount: number;
  vatRate: number;
  vatAmount: number;
  freight: number;
  netTotal: number;
  paid: number;
  creditApplied: number;
  remaining: number;
  paymentStatus: PaymentStatus;
  notes: string;
  cancelReason: string;
  createdAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  payments: PurchasePayment[];
  receipts: PurchaseReceipt[];
}

export interface PurchaseInput {
  supplierId: number;
  billNo?: string;
  purchaseDate?: string;
  discount?: number;
  vatRate?: number;
  freight?: number;
  notes?: string;
  lines: { productId: number; quantity: number; unitPrice: number }[];
}

export interface PurchaseFilters {
  search?: string;
  status?: PurchaseStatus | '';
  paymentStatus?: PaymentStatus | '';
  supplierId?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface PurchaseReturn {
  id: number;
  returnNo: string;
  purchaseId: number;
  purchaseNo: string;
  supplierId: number;
  supplierName: string;
  returnDate: string;
  reason: string;
  creditAmount: number;
  status: 'active' | 'void';
  voidReason: string;
  items: { productName: string; quantity: number; condition: string; creditAmount: number }[];
}

export interface CreditSettlement {
  id: number;
  supplierId: number;
  supplierName: string;
  kind: CreditKind;
  amount: number;
  settledOn: string;
  purchaseNo: string;
  method: string;
  deliveryStatus: string;
  reference: string;
  notes: string;
  status: 'active' | 'void';
  voidReason: string;
  items: { productName: string; quantity: number }[];
}

export const STATUS_LABEL: Record<PurchaseStatus, string> = {
  draft: 'Draft',
  partial: 'Part received',
  received: 'Received',
  cancelled: 'Cancelled',
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  partial: 'Part paid',
  paid: 'Paid',
};

export const METHOD_LABEL: Record<PayMethod, string> = {
  cash: 'Cash',
  bank: 'Bank',
  online: 'Online',
  cheque: 'Cheque',
};

export const CREDIT_LABEL: Record<CreditKind, string> = {
  refund: 'Refund',
  replacement: 'Replacement goods',
  adjustment: 'Set against a purchase',
};

// ---- API shapes --------------------------------------------------------

interface ApiLine {
  id: number;
  product: number;
  stock_no: string;
  product_name: string;
  unit: string;
  quantity: string;
  unit_price: string;
  line_total: string;
  received_quantity: string;
  remaining_quantity: string;
  returned_quantity: string;
  returnable_quantity: string;
  damaged_quantity?: string;
}

interface ApiPayment {
  id: number;
  purchase: number;
  purchase_no: string;
  amount: string;
  paid_on: string;
  method: PayMethod;
  reference: string;
  notes: string;
  status: 'active' | 'void';
  void_reason: string;
}

interface ApiReceipt {
  id: number;
  received_on: string;
  notes: string;
  items: { product_name: string; quantity: string; damaged_quantity?: string }[];
}

interface ApiPurchase {
  id: number;
  purchase_no: string;
  supplier: number;
  supplier_name: string;
  bill_no: string;
  purchase_date: string;
  status: PurchaseStatus;
  items: ApiLine[];
  subtotal: string;
  discount_amount: string;
  vat_rate: string;
  vat_amount: string;
  freight_amount: string;
  net_total: string;
  paid_amount: string;
  credit_applied: string;
  remaining_amount: string;
  payment_status: PaymentStatus;
  notes: string;
  cancel_reason: string;
  created_at?: string | null;
  received_at?: string | null;
  cancelled_at?: string | null;
  payments?: ApiPayment[];
  receipts?: ApiReceipt[];
}

interface ApiReturn {
  id: number;
  return_no: string;
  purchase: number;
  purchase_no: string;
  supplier: number;
  supplier_name: string;
  return_date: string;
  reason: string;
  credit_amount: string;
  status: 'active' | 'void';
  void_reason: string;
  items: { product_name: string; quantity: string; stock_condition: string; credit_amount: string }[];
}

interface ApiCredit {
  id: number;
  supplier: number;
  supplier_name: string;
  kind: CreditKind;
  amount: string;
  settled_on: string;
  purchase_no: string | null;
  method: string;
  delivery_status: string | null;
  reference: string;
  notes: string;
  status: 'active' | 'void';
  void_reason: string;
  items: { product_name: string; quantity: string }[];
}

interface Page<T> {
  count: number;
  next: string | null;
  results: T[];
}

const num = (v: string | number | null | undefined): number => Number(v ?? 0) || 0;

function paymentFromApi(p: ApiPayment): PurchasePayment {
  return {
    id: p.id,
    purchaseId: p.purchase,
    purchaseNo: p.purchase_no,
    amount: num(p.amount),
    paidOn: p.paid_on,
    method: p.method,
    reference: p.reference,
    notes: p.notes,
    status: p.status,
    voidReason: p.void_reason,
  };
}

function purchaseFromApi(p: ApiPurchase): Purchase {
  return {
    id: p.id,
    purchaseNo: p.purchase_no,
    supplierId: p.supplier,
    supplierName: p.supplier_name,
    billNo: p.bill_no,
    purchaseDate: p.purchase_date,
    status: p.status,
    lines: (p.items ?? []).map((l) => ({
      id: l.id,
      productId: l.product,
      stockNo: l.stock_no,
      productName: l.product_name,
      unit: l.unit,
      quantity: num(l.quantity),
      unitPrice: num(l.unit_price),
      lineTotal: num(l.line_total),
      receivedQuantity: num(l.received_quantity),
      remainingQuantity: num(l.remaining_quantity),
      returnedQuantity: num(l.returned_quantity),
      returnableQuantity: num(l.returnable_quantity),
      damagedQuantity: num(l.damaged_quantity),
    })),
    subtotal: num(p.subtotal),
    discount: num(p.discount_amount),
    vatRate: num(p.vat_rate),
    vatAmount: num(p.vat_amount),
    freight: num(p.freight_amount),
    netTotal: num(p.net_total),
    paid: num(p.paid_amount),
    creditApplied: num(p.credit_applied),
    remaining: num(p.remaining_amount),
    paymentStatus: p.payment_status,
    notes: p.notes,
    cancelReason: p.cancel_reason,
    createdAt: p.created_at ?? null,
    receivedAt: p.received_at ?? null,
    cancelledAt: p.cancelled_at ?? null,
    payments: (p.payments ?? []).map(paymentFromApi),
    receipts: (p.receipts ?? []).map((r) => ({
      id: r.id,
      receivedOn: r.received_on,
      notes: r.notes,
      items: r.items.map((i) => ({
        productName: i.product_name,
        quantity: num(i.quantity),
        damagedQuantity: num(i.damaged_quantity),
      })),
    })),
  };
}

function returnFromApi(r: ApiReturn): PurchaseReturn {
  return {
    id: r.id,
    returnNo: r.return_no,
    purchaseId: r.purchase,
    purchaseNo: r.purchase_no,
    supplierId: r.supplier,
    supplierName: r.supplier_name,
    returnDate: r.return_date,
    reason: r.reason,
    creditAmount: num(r.credit_amount),
    status: r.status,
    voidReason: r.void_reason,
    items: r.items.map((i) => ({
      productName: i.product_name,
      quantity: num(i.quantity),
      condition: i.stock_condition,
      creditAmount: num(i.credit_amount),
    })),
  };
}

function creditFromApi(c: ApiCredit): CreditSettlement {
  return {
    id: c.id,
    supplierId: c.supplier,
    supplierName: c.supplier_name,
    kind: c.kind,
    amount: num(c.amount),
    settledOn: c.settled_on,
    purchaseNo: c.purchase_no ?? '',
    method: c.method,
    deliveryStatus: c.delivery_status ?? '',
    reference: c.reference,
    notes: c.notes,
    status: c.status,
    voidReason: c.void_reason,
    items: c.items.map((i) => ({ productName: i.product_name, quantity: num(i.quantity) })),
  };
}

async function allPages<T, R>(path: string, map: (r: T) => R): Promise<R[]> {
  const out: R[] = [];
  const sep = path.includes('?') ? '&' : '?';
  for (let page = 1; ; page += 1) {
    const data = await api<Page<T>>(`${path}${sep}page=${page}&page_size=100`);
    out.push(...data.results.map(map));
    if (!data.next) break;
  }
  return out;
}

// ---- Purchases ---------------------------------------------------------

export async function listPurchases(filters: PurchaseFilters = {}): Promise<Purchase[]> {
  const q = new URLSearchParams();
  if (filters.search) q.set('search', filters.search);
  if (filters.status) q.set('status', filters.status);
  if (filters.paymentStatus) q.set('payment_status', filters.paymentStatus);
  if (filters.supplierId) q.set('supplier', String(filters.supplierId));
  if (filters.dateFrom) q.set('purchase_date__gte', filters.dateFrom);
  if (filters.dateTo) q.set('purchase_date__lte', filters.dateTo);
  const qs = q.toString();
  return allPages<ApiPurchase, Purchase>(`/purchases/${qs ? `?${qs}` : ''}`, purchaseFromApi);
}

export async function getPurchase(id: number): Promise<Purchase> {
  return purchaseFromApi(await api<ApiPurchase>(`/purchases/${id}/`));
}

function purchaseBody(input: PurchaseInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    supplier: input.supplierId,
    bill_no: (input.billNo ?? '').trim(),
    discount_amount: String(input.discount ?? 0),
    vat_rate: String(input.vatRate ?? 0),
    freight_amount: String(input.freight ?? 0),
    notes: (input.notes ?? '').trim(),
    items: input.lines.map((l) => ({
      product: l.productId,
      quantity: String(l.quantity),
      unit_price: l.unitPrice.toFixed(2),
    })),
  };
  if (input.purchaseDate) body.purchase_date = input.purchaseDate;
  return body;
}

export async function createPurchase(input: PurchaseInput): Promise<Purchase> {
  return purchaseFromApi(await api<ApiPurchase>('/purchases/', { method: 'POST', body: purchaseBody(input) }));
}

export async function updatePurchase(id: number, input: PurchaseInput): Promise<Purchase> {
  return purchaseFromApi(
    await api<ApiPurchase>(`/purchases/${id}/`, { method: 'PATCH', body: purchaseBody(input) }),
  );
}

export async function cancelPurchase(id: number, reason: string): Promise<Purchase> {
  return purchaseFromApi(
    await api<ApiPurchase>(`/purchases/${id}/cancel/`, { method: 'POST', body: { reason } }),
  );
}

/** No lines = everything still to come, all in good condition. Otherwise a part delivery; damagedQuantity is the part of quantity that arrived damaged. */
export async function receivePurchase(
  id: number,
  options: { lines?: { lineId: number; quantity: number; damagedQuantity?: number }[]; receivedOn?: string; notes?: string } = {},
): Promise<Purchase> {
  const body: Record<string, unknown> = {};
  if (options.lines && options.lines.length > 0) {
    body.items = options.lines.map((l) => ({
      purchase_item: l.lineId,
      // quantity is everything that arrived; damaged is the part of it that is damaged.
      quantity: l.quantity.toFixed(3),
      ...(l.damagedQuantity && l.damagedQuantity > 0 ? { damaged_quantity: l.damagedQuantity.toFixed(3) } : {}),
    }));
  }
  if (options.receivedOn) body.received_on = options.receivedOn;
  if (options.notes) body.notes = options.notes;
  return purchaseFromApi(await api<ApiPurchase>(`/purchases/${id}/receive/`, { method: 'POST', body }));
}

// ---- Payments ----------------------------------------------------------

export async function addPayment(input: {
  purchaseId: number;
  amount: number;
  method: PayMethod;
  paidOn?: string;
  reference?: string;
  notes?: string;
}): Promise<void> {
  const body: Record<string, unknown> = {
    purchase: input.purchaseId,
    amount: input.amount.toFixed(2),
    method: input.method,
    reference: (input.reference ?? '').trim(),
    notes: (input.notes ?? '').trim(),
  };
  if (input.paidOn) body.paid_on = input.paidOn;
  await api('/purchases/payments/', { method: 'POST', body });
}

export async function voidPayment(id: number, reason: string): Promise<void> {
  await api(`/purchases/payments/${id}/void/`, { method: 'POST', body: { reason } });
}

// ---- Returns and supplier credit ---------------------------------------

export async function listReturns(): Promise<PurchaseReturn[]> {
  return allPages<ApiReturn, PurchaseReturn>('/purchases/returns/', returnFromApi);
}

export async function createReturn(input: {
  purchaseId: number;
  reason: string;
  notes?: string;
  lines: { lineId: number; quantity: number; condition: 'good' | 'damaged' }[];
}): Promise<void> {
  await api('/purchases/returns/', {
    method: 'POST',
    body: {
      purchase: input.purchaseId,
      reason: input.reason.trim(),
      notes: (input.notes ?? '').trim(),
      items: input.lines.map((l) => ({
        purchase_item: l.lineId,
        quantity: l.quantity.toFixed(3),
        stock_condition: l.condition,
      })),
    },
  });
}

export async function voidReturn(id: number, reason: string): Promise<void> {
  await api(`/purchases/returns/${id}/void/`, { method: 'POST', body: { reason } });
}

export async function listCredits(): Promise<CreditSettlement[]> {
  return allPages<ApiCredit, CreditSettlement>('/purchases/credits/', creditFromApi);
}

export async function useCredit(input: {
  supplierId: number;
  kind: CreditKind;
  amount: number;
  method?: PayMethod;
  purchaseId?: number;
  items?: { productId: number; quantity: number }[];
  reference?: string;
  notes?: string;
}): Promise<void> {
  const body: Record<string, unknown> = {
    supplier: input.supplierId,
    kind: input.kind,
    amount: input.amount.toFixed(2),
    reference: (input.reference ?? '').trim(),
    notes: (input.notes ?? '').trim(),
  };
  if (input.kind === 'refund' && input.method) body.method = input.method;
  if (input.kind === 'adjustment' && input.purchaseId) body.purchase = input.purchaseId;
  if (input.kind === 'replacement') {
    body.items = (input.items ?? []).map((i) => ({ product: i.productId, quantity: i.quantity.toFixed(3) }));
  }
  await api('/purchases/credits/', { method: 'POST', body });
}

export async function receiveReplacement(id: number): Promise<void> {
  await api(`/purchases/credits/${id}/receive/`, { method: 'POST', body: {} });
}

export async function voidCredit(id: number, reason: string): Promise<void> {
  await api(`/purchases/credits/${id}/void/`, { method: 'POST', body: { reason } });
}

// ---- Form preview (the server is the source of truth) ------------------

export function previewTotals(
  lines: { quantity: number; unitPrice: number }[],
  discount: number,
  vatRate: number,
  freight: number,
) {
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const taxable = Math.max(0, subtotal - discount);
  const vat = (taxable * vatRate) / 100;
  return { subtotal, taxable, vat, net: taxable + vat + freight };
}

export function summarize(list: Purchase[]) {
  const live = list.filter((p) => p.status !== 'cancelled');
  return {
    count: list.length,
    drafts: list.filter((p) => p.status === 'draft').length,
    toReceive: list.filter((p) => p.status === 'draft' || p.status === 'partial').length,
    totalValue: live.reduce((s, p) => s + p.netTotal, 0),
    unpaid: live.reduce((s, p) => s + Math.max(0, p.remaining), 0),
  };
}

export function formatNpr(n: number): string {
  return `Rs. ${new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(n)}`;
}

export function formatQty(n: number): string {
  return new Intl.NumberFormat('en-NP', { maximumFractionDigits: 3 }).format(n);
}
