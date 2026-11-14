/**
 * Sales, from the API (/api/v1/sales/).
 *
 * A sale is a draft until it is confirmed; confirming takes the goods out of
 * stock and gives the invoice number. Totals, the EMI finance charge, the
 * instalment schedule and follow-ups are all worked out by the server. The
 * helpers here only preview totals while the form is open.
 */

import { api, apiDownload } from './api';

export type SaleStatus = 'draft' | 'confirmed' | 'cancelled';
export type SaleType = 'stock' | 'bike' | 'maintenance';
export type ServiceKind = 'paid' | 'free' | 'accident';
export type PaymentMode = 'full' | 'emi' | 'financed';
export type Payer = 'customer' | 'financer';
export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  full: 'Full payment',
  emi: 'Own EMI',
  financed: 'Financed by company',
};
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';
export type PayMethod = 'cash' | 'bank' | 'online' | 'cheque';
export type CreditKind = 'refund' | 'adjustment' | 'replacement';
export type FollowupKind =
  | 'maintenance_post'
  | 'maintenance_due'
  | 'emi_due'
  | 'credit_due'
  | 'financer_due'
  | 'free_service_due';
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
  payer: Payer;
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
  financerName: string;
  financerRef: string;
  financerDueDate: string | null;
  financerReceivable: number;
  financerReceived: number;
  downPayment: number;
  emiMonths: number;
  emiAmount: number;
  firstEmiDue: string;
  interestRate: number | null;
  financeCharge: number;
  serviceKind: ServiceKind;
  freeServiceFor: number | null;
  freeServiceForNo: string;
  odometerKm: number | null;
  documentsIgnored: boolean;
  documentsTotal: number;
  documentsVerified: number;
  freeServices: number;
  freeServiceCovers: string;
  freeServiceForCovers: string;
  freeServicesUsed: number;
  freeServicesLeft: number;
  freeServiceRecords: FreeService[];
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

export interface FreeService {
  id: number;
  number: number;
  serviceDate: string;
  odometerKm: number;
  performance: string;
  workDone: string;
  technician: string;
  recordedBy: string;
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
  financerName?: string;
  financerRef?: string;
  financerDueDate?: string;
  downPayment?: number;
  emiMonths?: number;
  /** Yearly interest in percent; 0 or empty means none. */
  interestRate?: number;
  firstEmiDue?: string;
  /** Bike sales: how many free services come with the bike. */
  freeServices?: number;
  freeServiceCovers?: string;
  /** Maintenance: normal, free (of a bike sold earlier) or accident case. */
  serviceKind?: ServiceKind;
  freeServiceFor?: number | null;
  odometerKm?: number | null;
  /** Accident case, when it is opened. */
  advanceAmount?: number;
  advanceMethod?: PayMethod;
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
  serviceNumber: number | null;
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

export const SERVICE_KIND_LABEL: Record<ServiceKind, string> = {
  paid: 'Normal service',
  free: 'Free service',
  accident: 'Accident case',
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
  financer_due: 'Payment due from finance company',
  free_service_due: 'Free service due',
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

interface ApiFreeService {
  id: number;
  number: number;
  service_date: string;
  odometer_km: number;
  performance: string;
  work_done: string;
  technician: string;
  recorded_by_name: string;
}

interface ApiPayment {
  id: number;
  amount: string;
  paid_on: string;
  method: PayMethod;
  payer?: Payer;
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
  financer_name?: string;
  financer_ref?: string;
  financer_due_date?: string | null;
  financer_receivable?: string;
  financer_received?: string;
  payment_mode: PaymentMode;
  down_payment: string;
  emi_months: number | null;
  emi_amount: string | null;
  first_emi_due: string | null;
  interest_rate: string | null;
  finance_charge: string;
  service_kind?: ServiceKind;
  free_service_for?: number | null;
  free_service_for_no?: string | null;
  odometer_km?: number | null;
  documents_ignored?: boolean;
  documents_total?: number;
  documents_verified?: number;
  free_services?: number;
  free_service_covers?: string;
  free_service_for_covers?: string | null;
  free_services_used?: number;
  free_services_left?: number;
  free_service_records?: ApiFreeService[];
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
    financerName: s.financer_name ?? '',
    financerRef: s.financer_ref ?? '',
    financerDueDate: s.financer_due_date ?? null,
    financerReceivable: num(s.financer_receivable ?? 0),
    financerReceived: num(s.financer_received ?? 0),
    downPayment: num(s.down_payment),
    emiMonths: s.emi_months ?? 0,
    emiAmount: num(s.emi_amount),
    firstEmiDue: s.first_emi_due ?? '',
    interestRate: s.interest_rate === null || s.interest_rate === undefined ? null : num(s.interest_rate),
    financeCharge: num(s.finance_charge),
    serviceKind: s.service_kind ?? 'paid',
    freeServiceFor: s.free_service_for ?? null,
    freeServiceForNo: s.free_service_for_no ?? '',
    odometerKm: s.odometer_km ?? null,
    documentsIgnored: s.documents_ignored ?? false,
    documentsTotal: s.documents_total ?? 0,
    documentsVerified: s.documents_verified ?? 0,
    freeServices: s.free_services ?? 0,
    freeServiceCovers: s.free_service_covers ?? '',
    freeServiceForCovers: s.free_service_for_covers ?? '',
    freeServicesUsed: s.free_services_used ?? 0,
    freeServicesLeft: s.free_services_left ?? 0,
    freeServiceRecords: (s.free_service_records ?? []).map((r) => ({
      id: r.id,
      number: r.number,
      serviceDate: r.service_date,
      odometerKm: r.odometer_km,
      performance: r.performance,
      workDone: r.work_done,
      technician: r.technician,
      recordedBy: r.recorded_by_name,
    })),
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
      payer: p.payer ?? 'customer',
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
    body.free_services = input.freeServices ?? 0;
    body.free_service_covers = (input.freeServiceCovers ?? '').trim();
    if (input.paymentMode === 'financed') {
      body.down_payment = String(input.downPayment ?? 0);
      body.financer_name = (input.financerName ?? '').trim();
      body.financer_ref = (input.financerRef ?? '').trim();
      body.financer_due_date = input.financerDueDate || null;
    }
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
    body.service_kind = input.serviceKind ?? 'paid';
    body.free_service_for = input.serviceKind === 'free' ? input.freeServiceFor ?? null : null;
    body.odometer_km = input.serviceKind === 'free' ? input.odometerKm ?? null : null;
    if (!isEdit && input.serviceKind === 'accident') {
      body.advance_amount = (input.advanceAmount ?? 0).toFixed(2);
      body.advance_method = input.advanceMethod ?? 'cash';
    }
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

export async function confirmSale(id: number, ignoreDocuments = false): Promise<Sale> {
  return saleFromApi(
    await api<ApiSale>(`/sales/${id}/confirm/`, {
      method: 'POST',
      body: ignoreDocuments ? { ignore_documents: true } : {},
    }),
  );
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
  payer?: Payer;
}): Promise<void> {
  const body: Record<string, unknown> = {
    sale: input.saleId,
    amount: input.amount.toFixed(2),
    method: input.method,
    reference: (input.reference ?? '').trim(),
    payer: input.payer ?? 'customer',
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
  service_number?: number | null;
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
    serviceNumber: f.service_number ?? null,
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
 * Same rule as the server: reducing-balance EMI on what is left after the
 * down payment, EMI = P r (1+r)^n / ((1+r)^n - 1) with r the yearly rate / 12,
 * rounded up to the paisa.
 */
export function previewEmi(net: number, down: number, months: number, yearlyRate: number) {
  const left = Math.max(0, net - down);
  const n = Math.max(1, months || 1);
  const r = (yearlyRate || 0) / 12 / 100;
  const each = r === 0 ? left / n : (left * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const monthly = Math.ceil(each * 100 - 1e-6) / 100;
  const payable = down + monthly * n;

  return { left, monthly, charge: Math.max(0, payable - net), due: Math.max(net, payable) };
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

export interface FreeServiceInput {
  serviceDate?: string;
  odometerKm: number;
  performance?: string;
  workDone?: string;
  technician?: string;
}

export async function addFreeService(saleId: number, input: FreeServiceInput): Promise<void> {
  await api(`/sales/${saleId}/free-services/`, {
    method: 'POST',
    body: {
      ...(input.serviceDate ? { service_date: input.serviceDate } : {}),
      odometer_km: input.odometerKm,
      performance: (input.performance ?? '').trim(),
      work_done: (input.workDone ?? '').trim(),
      technician: (input.technician ?? '').trim(),
    },
  });
}

export async function removeFreeService(saleId: number, recordId: number): Promise<void> {
  await api(`/sales/${saleId}/free-services/${recordId}/`, { method: 'DELETE' });
}

export async function setFreeServiceCount(saleId: number, count: number, covers?: string): Promise<void> {
  await api(`/sales/${saleId}/free-service-count/`, {
    method: 'POST',
    body: { free_services: count, ...(covers === undefined ? {} : { free_service_covers: covers.trim() }) },
  });
}

export interface SaleDocument {
  id: number;
  title: string;
  category: string;
  fileName: string;
  size: number;
  uploadedBy: string;
  createdAt: string;
  verified: boolean;
  verifiedBy: string;
  verifiedAt: string | null;
}

export const DOC_CATEGORY_LABEL: Record<string, string> = {
  police_report: 'Police report',
  insurance: 'Insurance',
  license: 'Driving licence',
  bluebook: 'Blue book',
  photo: 'Photo of damage',
  other: 'Other',
};

interface RawSaleDoc {
  id: number;
  title: string;
  category: string;
  original_name: string;
  size: number;
  uploaded_by_name: string;
  created_at: string;
  verified: boolean;
  verified_by_name: string;
  verified_at: string | null;
}

const docOf = (d: RawSaleDoc): SaleDocument => ({
  id: d.id,
  title: d.title,
  category: d.category,
  fileName: d.original_name,
  size: d.size,
  uploadedBy: d.uploaded_by_name,
  createdAt: d.created_at,
  verified: d.verified,
  verifiedBy: d.verified_by_name,
  verifiedAt: d.verified_at,
});

export async function listSaleDocuments(saleId: number): Promise<SaleDocument[]> {
  return (await api<RawSaleDoc[]>(`/sales/${saleId}/documents/`)).map(docOf);
}

export async function uploadSaleDocument(saleId: number, file: File, title: string, category: string): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  if (title.trim()) form.append('title', title.trim());
  form.append('category', category);
  await api(`/sales/${saleId}/documents/`, { method: 'POST', body: form });
}

export function downloadSaleDocument(saleId: number, doc: SaleDocument): Promise<void> {
  return apiDownload(`/sales/${saleId}/documents/${doc.id}/`, doc.fileName);
}

export async function verifySaleDocument(saleId: number, id: number, verified: boolean): Promise<void> {
  await api(`/sales/${saleId}/documents/${id}/verify/`, { method: 'POST', body: { verified } });
}

export async function deleteSaleDocument(saleId: number, id: number): Promise<void> {
  await api(`/sales/${saleId}/documents/${id}/`, { method: 'DELETE' });
}
