/**
 * Sales, from the API (/api/v1/sales/).
 *
 * A sale is a draft until it is confirmed; confirming takes the goods out of
 * stock and gives the invoice number. Totals, the EMI finance charge, the
 * instalment schedule and follow-ups are all worked out by the server. The
 * helpers here only preview totals while the form is open.
 */

import { api } from './api';

export type SaleStatus = 'draft' | 'confirmed' | 'cancelled';
export type SaleType = 'stock' | 'bike' | 'maintenance';
export type PaymentMode = 'full' | 'emi';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';
export type PayMethod = 'cash' | 'bank' | 'online' | 'cheque';
export type CreditKind = 'refund' | 'adjustment' | 'replacement';
export type FollowupKind = 'maintenance_post' | 'maintenance_due' | 'emi_due' | 'credit_due';
export type FollowupStatus = 'pending' | 'done' | 'skipped';

export interface SaleLine {
  id: number;
  productId: number | null;
  localProductId: number | null;
  bikeUnitId: number | null;
  name: string;
  stockNo: string;
  chassisNo: string;
  engineNo: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  returnedQuantity: number;
  returnableQuantity: number;
}

export interface SalePayment {
  id: number;
  amount: number;
  paidOn: string;
  method: PayMethod;
  reference: string;
  status: 'active' | 'void';
  voidReason: string;
}

export interface Installment {
  id: number;
  number: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: string;
}

export interface Sale {
  id: number;
  saleNo: string;
  invoiceNo: string;
  customerId: number | null;
  customerName: string;
  walkInName: string;
  saleDate: string;
  saleType: SaleType;
  status: SaleStatus;
  lines: SaleLine[];
  subtotal: number;
  discount: number;
  vatRate: number;
  vatAmount: number;
  netTotal: number;
  paymentMode: PaymentMode;
  downPayment: number;
  emiMonths: number;
  emiAmount: number;
  firstEmiDue: string;
  interestRate: number | null;
  financeCharge: number;
  amountDue: number;
  dueDate: string;
  vehicleChassisNo: string;
  vehicleRegNo: string;
  paid: number;
  creditApplied: number;
  returnedAmount: number;
  remaining: number;
  paymentStatus: PaymentStatus;
  notes: string;
  cancelReason: string;
  payments: SalePayment[];
  installments: Installment[];
  createdAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
}

export interface SaleLineInput {
  productId?: number;
  localProductId?: number;
  bikeUnitId?: number;
  description?: string;
  quantity?: number;
  /** Leave out to use the product's sale price. */
  unitPrice?: number;
}

export interface SaleInput {
  saleType: SaleType;
  customerId?: number | null;
  walkInName?: string;
  saleDate?: string;
  discount?: number;
  vatRate?: number;
  paymentMode?: PaymentMode;
  downPayment?: number;
  emiMonths?: number;
  /** Yearly interest in percent; 0 or empty means none. */
  interestRate?: number;
  firstEmiDue?: string;
  dueDate?: string;
  vehicleChassisNo?: string;
  vehicleRegNo?: string;
  notes?: string;
  lines: SaleLineInput[];
}

export interface SaleFilters {
  search?: string;
  status?: SaleStatus | '';
  saleType?: SaleType | '';
  paymentStatus?: PaymentStatus | '';
  customerId?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface SaleReturn {
  id: number;
  returnNo: string;
  saleId: number;
  saleNo: string;
  invoiceNo: string;
  customerName: string;
  returnDate: string;
  reason: string;
  goodsValue: number;
  appliedAmount: number;
  creditAmount: number;
  status: 'active' | 'void';
  items: { productName: string; quantity: number }[];
}

export interface SaleCredit {
  id: number;
  customerId: number;
  customerName: string;
  kind: CreditKind;
  amount: number;
  settledOn: string;
  saleNo: string;
  returnNo: string;
  method: string;
  deliveryStatus: string;
  status: 'active' | 'void';
  items: { productName: string; quantity: number }[];
}

export interface Followup {
  id: number;
  kind: FollowupKind;
  saleId: number;
  saleNo: string;
  invoiceNo: string;
  customerName: string;
  customerPhone: string;
  vehicleChassisNo: string;
  vehicleRegNo: string;
  installmentNumber: number | null;
  dueDate: string;
  amount: number;
  status: FollowupStatus;
  isOverdue: boolean;
  autoClosed: boolean;
  note: string;
  hasIssue: boolean;
  previous: { dueDate: string; status: string; hasIssue: boolean; note: string } | null;
}

export interface BikeUnit {
  id: number;
  productId: number;
  productName: string;
  chassisNo: string;
  engineNo: string;
  color: string;
  status: 'in_stock' | 'sold';
}

export interface LocalProduct {
  id: number;
  name: string;
  description: string;
  brand: string;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  isActive: boolean;
}

export const STATUS_LABEL: Record<SaleStatus, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
};

export const TYPE_LABEL: Record<SaleType, string> = {
  stock: 'Stock sale',
  bike: 'Bike sale',
  maintenance: 'Maintenance',
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
  adjustment: 'Set against a sale',
  replacement: 'Replacement goods',
};

export const FOLLOWUP_LABEL: Record<FollowupKind, string> = {
  maintenance_post: 'Post-service check (3 days)',
  maintenance_due: 'Maintenance follow-up (90 days)',
  emi_due: 'EMI instalment',
  credit_due: 'Credit to receive',
};

// ---- API shapes --------------------------------------------------------

interface ApiLine {
  id: number;
  product: number | null;
  local_product: number | null;
  bike_unit: number | null;
  product_name: string;
  stock_no: string;
  chassis_no: string | null;
  engine_no: string | null;
  quantity: string;
  unit_price: string;
  line_total: string;
  returned_quantity: string;
  returnable_quantity: string;
}

interface ApiPayment {
  id: number;
  amount: string;
  paid_on: string;
  method: PayMethod;
  reference: string;
  status: 'active' | 'void';
  void_reason: string;
}

interface ApiInstallment {
  id: number;
  number: number;
  due_date: string;
  amount: string;
  paid_amount: string;
  status: string;
}

interface ApiSale {
  id: number;
  sale_no: string;
  invoice_no: string;
  customer: number | null;
  customer_name: string;
  walk_in_name: string;
  sale_date: string;
  sale_type: SaleType;
  status: SaleStatus;
  items: ApiLine[];
  subtotal: string;
  discount_amount: string;
  vat_rate: string;
  vat_amount: string;
  net_total: string;
  payment_mode: PaymentMode;
  down_payment: string;
  emi_months: number | null;
  emi_amount: string | null;
  first_emi_due: string | null;
  interest_rate: string | null;
  finance_charge: string;
  amount_due: string;
  due_date: string | null;
  vehicle_chassis_no: string;
  vehicle_reg_no: string;
  paid_amount: string;
  credit_applied: string;
  returned_amount: string;
  remaining_amount: string;
  payment_status: PaymentStatus;
  notes: string;
  cancel_reason: string;
  payments?: ApiPayment[];
  installments?: ApiInstallment[];
  created_at?: string | null;
  confirmed_at?: string | null;
  cancelled_at?: string | null;
}

interface Page<T> {
  count: number;
  next: string | null;
  results: T[];
}

const num = (v: string | number | null | undefined): number => Number(v ?? 0) || 0;

function saleFromApi(s: ApiSale): Sale {
  return {
    id: s.id,
    saleNo: s.sale_no,
    invoiceNo: s.invoice_no,
    customerId: s.customer,
    customerName: s.customer_name,
    walkInName: s.walk_in_name,
    saleDate: s.sale_date,
    saleType: s.sale_type,
    status: s.status,
    lines: (s.items ?? []).map((l) => ({
      id: l.id,
      productId: l.product,
      localProductId: l.local_product,
      bikeUnitId: l.bike_unit,
      name: l.product_name,
      stockNo: l.stock_no,
      chassisNo: l.chassis_no ?? '',
      engineNo: l.engine_no ?? '',
      quantity: num(l.quantity),
      unitPrice: num(l.unit_price),
      lineTotal: num(l.line_total),
      returnedQuantity: num(l.returned_quantity),
      returnableQuantity: num(l.returnable_quantity),
    })),
    subtotal: num(s.subtotal),
    discount: num(s.discount_amount),
    vatRate: num(s.vat_rate),
    vatAmount: num(s.vat_amount),
    netTotal: num(s.net_total),
    paymentMode: s.payment_mode,
    downPayment: num(s.down_payment),
    emiMonths: s.emi_months ?? 0,
    emiAmount: num(s.emi_amount),
    firstEmiDue: s.first_emi_due ?? '',
    interestRate: s.interest_rate === null || s.interest_rate === undefined ? null : num(s.interest_rate),
    financeCharge: num(s.finance_charge),
    amountDue: num(s.amount_due),
    dueDate: s.due_date ?? '',
    vehicleChassisNo: s.vehicle_chassis_no,
    vehicleRegNo: s.vehicle_reg_no,
    paid: num(s.paid_amount),
    creditApplied: num(s.credit_applied),
    returnedAmount: num(s.returned_amount),
    remaining: num(s.remaining_amount),
    paymentStatus: s.payment_status,
    notes: s.notes,
    cancelReason: s.cancel_reason,
    createdAt: s.created_at ?? null,
    confirmedAt: s.confirmed_at ?? null,
    cancelledAt: s.cancelled_at ?? null,
    payments: (s.payments ?? []).map((p) => ({
      id: p.id,
      amount: num(p.amount),
      paidOn: p.paid_on,
      method: p.method,
      reference: p.reference,
      status: p.status,
      voidReason: p.void_reason,
    })),
    installments: (s.installments ?? []).map((i) => ({
      id: i.id,
      number: i.number,
      dueDate: i.due_date,
      amount: num(i.amount),
      paidAmount: num(i.paid_amount),
      status: i.status,
    })),
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

// ---- Sales -------------------------------------------------------------

export function listSales(filters: SaleFilters = {}): Promise<Sale[]> {
  const q = new URLSearchParams();
  if (filters.search) q.set('search', filters.search);
  if (filters.status) q.set('status', filters.status);
  if (filters.saleType) q.set('sale_type', filters.saleType);
  if (filters.paymentStatus) q.set('payment_status', filters.paymentStatus);
  if (filters.customerId) q.set('customer', String(filters.customerId));
  if (filters.dateFrom) q.set('sale_date__gte', filters.dateFrom);
  if (filters.dateTo) q.set('sale_date__lte', filters.dateTo);
  const qs = q.toString();
  return allPages<ApiSale, Sale>(`/sales/${qs ? `?${qs}` : ''}`, saleFromApi);
}

export async function getSale(id: number): Promise<Sale> {
  return saleFromApi(await api<ApiSale>(`/sales/${id}/`));
}

function saleBody(input: SaleInput, isEdit: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    customer: input.customerId ?? null,
    walk_in_name: (input.walkInName ?? '').trim(),
    discount_amount: String(input.discount ?? 0),
    vat_rate: String(input.vatRate ?? 0),
    notes: (input.notes ?? '').trim(),
    items: input.lines.map((l) => {
      const line: Record<string, unknown> = {};
      if (l.productId) line.product = l.productId;
      if (l.localProductId) line.local_product = l.localProductId;
      if (l.bikeUnitId) line.bike_unit = l.bikeUnitId;
      if (l.description) line.description = l.description;
      if (l.quantity !== undefined) line.quantity = String(l.quantity);
      if (l.unitPrice !== undefined) line.unit_price = l.unitPrice.toFixed(2);
      return line;
    }),
  };
  // The kind of sale is fixed once the draft exists.
  if (!isEdit) body.sale_type = input.saleType;
  if (input.saleDate) body.sale_date = input.saleDate;
  if (input.saleType === 'bike') {
    body.payment_mode = input.paymentMode ?? 'full';
    if (input.paymentMode === 'emi') {
      body.down_payment = String(input.downPayment ?? 0);
      body.emi_months = input.emiMonths;
      // The monthly amount is worked out by the server from the interest.
      body.interest_rate = String(input.interestRate ?? 0);
      if (input.firstEmiDue) body.first_emi_due = input.firstEmiDue;
    }
  }
  if (input.saleType !== 'bike') body.due_date = input.dueDate || null;
  if (input.saleType === 'maintenance') {
    body.vehicle_chassis_no = (input.vehicleChassisNo ?? '').trim();
    body.vehicle_reg_no = (input.vehicleRegNo ?? '').trim();
  }
  return body;
}

export async function createSale(input: SaleInput): Promise<Sale> {
  return saleFromApi(await api<ApiSale>('/sales/', { method: 'POST', body: saleBody(input, false) }));
}

export async function updateSale(id: number, input: SaleInput): Promise<Sale> {
  return saleFromApi(await api<ApiSale>(`/sales/${id}/`, { method: 'PATCH', body: saleBody(input, true) }));
}

export async function confirmSale(id: number): Promise<Sale> {
  return saleFromApi(await api<ApiSale>(`/sales/${id}/confirm/`, { method: 'POST', body: {} }));
}

export async function cancelSale(id: number, reason: string): Promise<Sale> {
  return saleFromApi(await api<ApiSale>(`/sales/${id}/cancel/`, { method: 'POST', body: { reason } }));
}

export async function addPayment(input: {
  saleId: number;
  amount: number;
  method: PayMethod;
  paidOn?: string;
  reference?: string;
}): Promise<void> {
  const body: Record<string, unknown> = {
    sale: input.saleId,
    amount: input.amount.toFixed(2),
    method: input.method,
    reference: (input.reference ?? '').trim(),
  };
  if (input.paidOn) body.paid_on = input.paidOn;
  await api('/sales/payments/', { method: 'POST', body });
}

export async function voidPayment(id: number, reason: string): Promise<void> {
  await api(`/sales/payments/${id}/void/`, { method: 'POST', body: { reason } });
}

// ---- Returns and customer credit ---------------------------------------

interface ApiReturn {
  id: number;
  return_no: string;
  sale: number;
  sale_no: string;
  invoice_no: string;
  customer_name: string;
  return_date: string;
  reason: string;
  goods_value: string;
  applied_amount: string;
  credit_amount: string;
  status: 'active' | 'void';
  items: { product_name: string; quantity: string }[];
}

export function listReturns(): Promise<SaleReturn[]> {
  return allPages<ApiReturn, SaleReturn>('/sales/returns/', (r) => ({
    id: r.id,
    returnNo: r.return_no,
    saleId: r.sale,
    saleNo: r.sale_no,
    invoiceNo: r.invoice_no,
    customerName: r.customer_name,
    returnDate: r.return_date,
    reason: r.reason,
    goodsValue: num(r.goods_value),
    appliedAmount: num(r.applied_amount),
    creditAmount: num(r.credit_amount),
    status: r.status,
    items: r.items.map((i) => ({ productName: i.product_name, quantity: num(i.quantity) })),
  }));
}

export async function createReturn(input: {
  saleId: number;
  reason: string;
  lines: { lineId: number; quantity: number }[];
  /** Walk-in sales only: how the money is paid back now. */
  refundMethod?: PayMethod;
}): Promise<void> {
  const body: Record<string, unknown> = {
    sale: input.saleId,
    reason: input.reason.trim(),
    items: input.lines.map((l) => ({ sale_item: l.lineId, quantity: l.quantity.toFixed(3) })),
  };
  if (input.refundMethod) body.refund_method = input.refundMethod;
  await api('/sales/returns/', { method: 'POST', body });
}

export async function voidReturn(id: number, reason: string): Promise<void> {
  await api(`/sales/returns/${id}/void/`, { method: 'POST', body: { reason } });
}

interface ApiCredit {
  id: number;
  customer: number;
  customer_name: string;
  kind: CreditKind;
  amount: string;
  settled_on: string;
  sale_no: string | null;
  return_no: string | null;
  method: string;
  delivery_status: string | null;
  status: 'active' | 'void';
  items: { product_name: string; quantity: string }[];
}

export function listCredits(): Promise<SaleCredit[]> {
  return allPages<ApiCredit, SaleCredit>('/sales/credits/', (c) => ({
    id: c.id,
    customerId: c.customer,
    customerName: c.customer_name,
    kind: c.kind,
    amount: num(c.amount),
    settledOn: c.settled_on,
    saleNo: c.sale_no ?? '',
    returnNo: c.return_no ?? '',
    method: c.method,
    deliveryStatus: c.delivery_status ?? '',
    status: c.status,
    items: c.items.map((i) => ({ productName: i.product_name, quantity: num(i.quantity) })),
  }));
}

export async function useCredit(input: {
  customerId: number;
  kind: CreditKind;
  amount: number;
  method?: PayMethod;
  saleId?: number;
  items?: { productId: number; quantity: number }[];
  notes?: string;
}): Promise<void> {
  const body: Record<string, unknown> = {
    customer: input.customerId,
    kind: input.kind,
    amount: input.amount.toFixed(2),
    notes: (input.notes ?? '').trim(),
  };
  if (input.kind === 'refund' && input.method) body.method = input.method;
  if (input.kind === 'adjustment' && input.saleId) body.sale = input.saleId;
  if (input.kind === 'replacement') {
    body.items = (input.items ?? []).map((i) => ({ product: i.productId, quantity: i.quantity.toFixed(3) }));
  }
  await api('/sales/credits/', { method: 'POST', body });
}

export async function deliverReplacement(id: number): Promise<void> {
  await api(`/sales/credits/${id}/deliver/`, { method: 'POST', body: {} });
}

export async function voidCredit(id: number, reason: string): Promise<void> {
  await api(`/sales/credits/${id}/void/`, { method: 'POST', body: { reason } });
}

// ---- Follow-ups --------------------------------------------------------

interface ApiFollowup {
  id: number;
  kind: FollowupKind;
  sale: number;
  sale_no: string;
  invoice_no: string;
  customer_name: string;
  customer_phone: string;
  vehicle_chassis_no: string;
  vehicle_reg_no: string;
  installment_number: number | null;
  due_date: string;
  amount: string | null;
  status: FollowupStatus;
  is_overdue: boolean;
  auto_closed: boolean;
  note: string;
  has_issue: boolean;
  previous_followup: { due_date: string; status: string; has_issue: boolean; note: string } | null;
}

export function listFollowups(filters: { status?: FollowupStatus | ''; kind?: FollowupKind | ''; overdue?: boolean } = {}): Promise<Followup[]> {
  const q = new URLSearchParams();
  if (filters.status) q.set('status', filters.status);
  if (filters.kind) q.set('kind', filters.kind);
  if (filters.overdue) q.set('overdue', 'true');
  const qs = q.toString();
  return allPages<ApiFollowup, Followup>(`/sales/followups/${qs ? `?${qs}` : ''}`, (f) => ({
    id: f.id,
    kind: f.kind,
    saleId: f.sale,
    saleNo: f.sale_no,
    invoiceNo: f.invoice_no,
    customerName: f.customer_name,
    customerPhone: f.customer_phone,
    vehicleChassisNo: f.vehicle_chassis_no,
    vehicleRegNo: f.vehicle_reg_no,
    installmentNumber: f.installment_number,
    dueDate: f.due_date,
    amount: num(f.amount),
    status: f.status,
    isOverdue: f.is_overdue,
    autoClosed: f.auto_closed,
    note: f.note,
    hasIssue: f.has_issue,
    previous: f.previous_followup
      ? {
          dueDate: f.previous_followup.due_date,
          status: f.previous_followup.status,
          hasIssue: f.previous_followup.has_issue,
          note: f.previous_followup.note,
        }
      : null,
  }));
}

export async function markFollowupDone(
  id: number,
  input: { note?: string; hasIssue?: boolean; nextDueDate?: string },
): Promise<void> {
  const body: Record<string, unknown> = { note: (input.note ?? '').trim(), has_issue: Boolean(input.hasIssue) };
  if (input.nextDueDate) body.next_due_date = input.nextDueDate;
  await api(`/sales/followups/${id}/done/`, { method: 'POST', body });
}

export async function skipFollowup(id: number, note: string): Promise<void> {
  await api(`/sales/followups/${id}/skip/`, { method: 'POST', body: { note } });
}

// ---- Bikes and local products ------------------------------------------

interface ApiBike {
  id: number;
  product: number;
  product_name: string;
  chassis_no: string;
  engine_no: string;
  color: string;
  status: 'in_stock' | 'sold';
}

export function listBikes(status: 'in_stock' | 'sold' | '' = ''): Promise<BikeUnit[]> {
  return allPages<ApiBike, BikeUnit>(`/sales/bikes/${status ? `?status=${status}` : ''}`, (b) => ({
    id: b.id,
    productId: b.product,
    productName: b.product_name,
    chassisNo: b.chassis_no,
    engineNo: b.engine_no,
    color: b.color,
    status: b.status,
  }));
}

export async function registerBike(input: {
  productId: number;
  chassisNo: string;
  engineNo: string;
  color?: string;
}): Promise<void> {
  await api('/sales/bikes/', {
    method: 'POST',
    body: {
      product: input.productId,
      chassis_no: input.chassisNo.trim(),
      engine_no: input.engineNo.trim(),
      color: (input.color ?? '').trim(),
    },
  });
}

interface ApiLocal {
  id: number;
  name: string;
  description: string;
  brand: string;
  unit: string;
  purchase_price: string;
  sale_price: string;
  is_active: boolean;
}

export async function listLocalProducts(): Promise<LocalProduct[]> {
  return allPages<ApiLocal, LocalProduct>('/sales/local-products/', (p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    brand: p.brand,
    unit: p.unit,
    purchasePrice: num(p.purchase_price),
    salePrice: num(p.sale_price),
    isActive: p.is_active,
  }));
}

export async function createLocalProduct(input: { name: string; unit?: string; salePrice?: number; purchasePrice?: number }): Promise<void> {
  await api('/sales/local-products/', {
    method: 'POST',
    body: {
      name: input.name.trim(),
      unit: (input.unit ?? '').trim() || 'pcs',
      sale_price: (input.salePrice ?? 0).toFixed(2),
      purchase_price: (input.purchasePrice ?? 0).toFixed(2),
    },
  });
}

// ---- Form preview (the server is the source of truth) ------------------

export function previewTotals(lines: { quantity: number; unitPrice: number }[], discount: number, vatRate: number) {
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const taxable = Math.max(0, subtotal - discount);
  const vat = (taxable * vatRate) / 100;
  return { subtotal, vat, net: taxable + vat };
}

/**
 * Same rule as the server: yearly flat interest on what is left after the
 * down payment, shared over the months and rounded up to the paisa.
 */
export function previewEmi(net: number, down: number, months: number, yearlyRate: number) {
  const left = Math.max(0, net - down);
  const m = Math.max(1, months || 1);
  const interest = (left * (yearlyRate || 0) * m) / 100 / 12;
  const monthly = Math.ceil(((left + interest) / m) * 100 - 1e-9) / 100;
  const payable = down + monthly * m;

  return { left, interest, monthly, charge: Math.max(0, payable - net), due: Math.max(net, payable) };
}

export function summarize(list: Sale[]) {
  const live = list.filter((s) => s.status !== 'cancelled');
  return {
    count: list.length,
    drafts: list.filter((s) => s.status === 'draft').length,
    totalValue: live.reduce((s, x) => s + x.netTotal, 0),
    toReceive: list
      .filter((s) => s.status === 'confirmed')
      .reduce((s, x) => s + Math.max(0, x.remaining), 0),
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
