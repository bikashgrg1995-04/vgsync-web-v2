/**
 * Money in and out, from the API: expenses and income (/finance/) and staff
 * pay (/payroll/). Owner only. Money comes back as strings.
 *
 * Expenses from payroll and supplier payments, and income from customer
 * payments, are created by those payments and are read-only here: void the
 * payment instead.
 */

import { api } from './api';

export type PayMethod = 'cash' | 'bank' | 'online' | 'cheque';
export type LedgerStatus = 'active' | 'void';

export type ExpenseCategory =
  | 'salary'
  | 'purchase'
  | 'rent'
  | 'utilities'
  | 'transport'
  | 'marketing'
  | 'maintenance'
  | 'other';

export type IncomeCategory = 'stock_sale' | 'bike_sale' | 'maintenance' | 'other';

export const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  salary: 'Salary',
  purchase: 'Purchase',
  rent: 'Rent',
  utilities: 'Utilities',
  transport: 'Transport',
  marketing: 'Marketing',
  maintenance: 'Maintenance',
  other: 'Other',
};

/** What the owner can enter by hand (salary and purchase come from payments). */
export const MANUAL_EXPENSE: ExpenseCategory[] = ['rent', 'utilities', 'transport', 'marketing', 'maintenance', 'other'];

export const INCOME_LABEL: Record<IncomeCategory, string> = {
  stock_sale: 'Stock sale',
  bike_sale: 'Bike sale',
  maintenance: 'Maintenance',
  other: 'Other',
};

export const METHOD_LABEL: Record<PayMethod, string> = {
  cash: 'Cash',
  bank: 'Bank transfer',
  online: 'Online',
  cheque: 'Cheque',
};

const num = (v: string | number | null | undefined): number => Number(v ?? 0) || 0;

interface Page<T> {
  count: number;
  next: string | null;
  results: T[];
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

// ---- Expenses and income -------------------------------------------------

export interface LedgerEntry {
  id: number;
  category: string;
  amount: number;
  date: string;
  description: string;
  method: PayMethod | '';
  reference: string;
  /** Created by a payment, so it cannot be edited or voided here. */
  locked: boolean;
  status: LedgerStatus;
  voidReason: string;
}

export interface LedgerFilters {
  category?: string;
  status?: LedgerStatus | '';
  dateFrom?: string;
  dateTo?: string;
}

export interface LedgerSummary {
  total: number;
  refunds: number;
  net: number;
  byCategory: { category: string; total: number }[];
}

export interface LedgerInput {
  category: string;
  amount: number;
  date: string;
  description?: string;
  method?: PayMethod | '';
  reference?: string;
}

interface ApiLedger {
  id: number;
  category: string;
  amount: string;
  expense_date?: string;
  income_date?: string;
  description: string;
  payment_method: PayMethod | '';
  reference: string;
  payroll_payment?: number | null;
  purchase_payment?: number | null;
  sale_payment?: number | null;
  status: LedgerStatus;
  void_reason: string;
}

export type LedgerKind = 'expenses' | 'income';

const dateField = (kind: LedgerKind) => (kind === 'expenses' ? 'expense_date' : 'income_date');
const base = (kind: LedgerKind) => (kind === 'expenses' ? '/finance/expenses' : '/finance/income');

function ledgerFromApi(kind: LedgerKind, r: ApiLedger): LedgerEntry {
  return {
    id: r.id,
    category: r.category,
    amount: num(r.amount),
    date: (kind === 'expenses' ? r.expense_date : r.income_date) ?? '',
    description: r.description,
    method: r.payment_method,
    reference: r.reference,
    locked: Boolean(r.payroll_payment || r.purchase_payment || r.sale_payment),
    status: r.status,
    voidReason: r.void_reason,
  };
}

function ledgerQuery(kind: LedgerKind, f: LedgerFilters): string {
  const q = new URLSearchParams();
  if (f.category) q.set('category', f.category);
  if (f.status) q.set('status', f.status);
  if (f.dateFrom) q.set(`${dateField(kind)}__gte`, f.dateFrom);
  if (f.dateTo) q.set(`${dateField(kind)}__lte`, f.dateTo);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function listLedger(kind: LedgerKind, f: LedgerFilters = {}): Promise<LedgerEntry[]> {
  return allPages<ApiLedger, LedgerEntry>(`${base(kind)}/${ledgerQuery(kind, f)}`, (r) => ledgerFromApi(kind, r));
}

export async function ledgerSummary(kind: LedgerKind, f: LedgerFilters = {}): Promise<LedgerSummary> {
  // The summary counts active entries only, whatever the status filter.
  const { status: _ignored, ...rest } = f;
  const r = await api<Record<string, unknown>>(`${base(kind)}/summary/${ledgerQuery(kind, rest)}`);
  const refunds = num((kind === 'expenses' ? r.purchase_refunds : r.sale_refunds) as string);
  return {
    total: num(r.total as string),
    refunds,
    net: num(r.net_total as string),
    byCategory: ((r.by_category as { category: string; total: string }[]) ?? []).map((c) => ({
      category: c.category,
      total: num(c.total),
    })),
  };
}

function ledgerBody(kind: LedgerKind, input: LedgerInput): Record<string, unknown> {
  return {
    category: input.category,
    amount: input.amount.toFixed(2),
    [dateField(kind)]: input.date,
    description: (input.description ?? '').trim(),
    payment_method: input.method ?? '',
    reference: (input.reference ?? '').trim(),
  };
}

export async function createLedger(kind: LedgerKind, input: LedgerInput): Promise<void> {
  await api(`${base(kind)}/`, { method: 'POST', body: ledgerBody(kind, input) });
}

export async function updateLedger(kind: LedgerKind, id: number, input: LedgerInput): Promise<void> {
  await api(`${base(kind)}/${id}/`, { method: 'PATCH', body: ledgerBody(kind, input) });
}

export async function voidLedger(kind: LedgerKind, id: number, reason: string): Promise<void> {
  await api(`${base(kind)}/${id}/void/`, { method: 'POST', body: { reason } });
}

// ---- Payroll ---------------------------------------------------------------

export type PayType = 'monthly' | 'daily';
export type EntryKind = 'wage' | 'bonus' | 'deduction';

export interface PayBalance {
  staffId: number;
  name: string;
  isActive: boolean;
  payType: PayType;
  totalEarned: number;
  totalDeducted: number;
  totalPaid: number;
  remaining: number;
  previousRemaining: number;
  currentRemaining: number;
  advance: number;
  nextSalaryDate: string | null;
  lastPaymentDate: string | null;
}

export interface Unsettled {
  id: number;
  kind: string;
  date: string;
  description: string;
  amount: number;
  paid: number;
  remaining: number;
  carriedOver: boolean;
}

export interface StatementRow {
  id: number;
  date: string;
  /** 'payment', or the kind of entry: salary, wage, bonus, deduction. */
  type: string;
  direction: 'earned' | 'deducted' | 'paid';
  description: string;
  amount: number;
  method: string;
  reference: string;
  advancePart: number;
  owedAfter: number;
  advanceAfter: number;
}

export interface SalaryProfile {
  staffId: number;
  name: string;
  payType: PayType;
  rate: number;
  allowances: number;
  salaryDay: number;
  startDate: string;
}

export interface SalaryInput {
  payType: PayType;
  rate?: number;
  allowances?: number;
  salaryDay?: number;
  startDate?: string;
}

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function balanceFromApi(r: Raw): PayBalance {
  return {
    staffId: r.staff,
    name: r.staff_name,
    isActive: r.is_active,
    payType: r.pay_type,
    totalEarned: num(r.total_earned),
    totalDeducted: num(r.total_deducted),
    totalPaid: num(r.total_paid),
    remaining: num(r.remaining),
    previousRemaining: num(r.previous_remaining),
    currentRemaining: num(r.current_remaining),
    advance: num(r.advance),
    nextSalaryDate: r.next_salary_date ?? null,
    lastPaymentDate: r.last_payment_date ?? null,
  };
}

export function listBalances(search = ''): Promise<PayBalance[]> {
  const q = search ? `?search=${encodeURIComponent(search)}` : '';
  return allPages<Raw, PayBalance>(`/payroll/balances/${q}`, balanceFromApi);
}

export async function getBalance(staffId: number): Promise<{ balance: PayBalance; unsettled: Unsettled[] }> {
  const r = await api<Raw>(`/payroll/balances/${staffId}/`);
  return {
    balance: balanceFromApi(r),
    unsettled: (r.unsettled as Raw[]).map((u) => ({
      id: u.id,
      kind: u.kind,
      date: u.entry_date,
      description: u.description,
      amount: num(u.amount),
      paid: num(u.paid),
      remaining: num(u.remaining),
      carriedOver: Boolean(u.carried_over),
    })),
  };
}

export async function listStatement(staffId: number, dateFrom = '', dateTo = ''): Promise<StatementRow[]> {
  const q = new URLSearchParams();
  if (dateFrom) q.set('date_from', dateFrom);
  if (dateTo) q.set('date_to', dateTo);
  const qs = q.toString();
  return allPages<Raw, StatementRow>(`/payroll/balances/${staffId}/statement/${qs ? `?${qs}` : ''}`, (s) => ({
    id: s.id,
    date: s.date,
    type: s.type,
    direction: s.direction,
    description: s.description,
    amount: num(s.amount),
    method: s.method,
    reference: s.reference,
    advancePart: num(s.advance_part),
    owedAfter: num(s.owed_after),
    advanceAfter: num(s.advance_after),
  }));
}

function salaryFromApi(r: Raw): SalaryProfile {
  return {
    staffId: r.staff,
    name: r.staff_name,
    payType: r.pay_type,
    rate: num(r.rate),
    allowances: num(r.allowances),
    salaryDay: r.salary_day ?? 1,
    startDate: r.start_date ?? '',
  };
}

export async function listSalaries(): Promise<SalaryProfile[]> {
  return allPages<Raw, SalaryProfile>('/payroll/salaries/', salaryFromApi);
}

export async function saveSalary(staffId: number, input: SalaryInput): Promise<SalaryProfile> {
  const body: Record<string, unknown> = { pay_type: input.payType };
  if (input.payType === 'monthly') {
    body.rate = (input.rate ?? 0).toFixed(2);
    body.allowances = (input.allowances ?? 0).toFixed(2);
    body.salary_day = input.salaryDay ?? 1;
  }
  if (input.startDate) body.start_date = input.startDate;
  return salaryFromApi(await api<Raw>(`/payroll/salaries/${staffId}/`, { method: 'PUT', body }));
}

export async function addEntry(input: {
  staffId: number;
  kind: EntryKind;
  date: string;
  amount: number;
  description?: string;
}): Promise<void> {
  await api('/payroll/entries/', {
    method: 'POST',
    body: {
      staff: input.staffId,
      kind: input.kind,
      entry_date: input.date,
      amount: input.amount.toFixed(2),
      description: (input.description ?? '').trim(),
    },
  });
}

export async function voidEntry(id: number, reason: string): Promise<void> {
  await api(`/payroll/entries/${id}/void/`, { method: 'POST', body: { reason } });
}

export async function addPayrollPayment(input: {
  staffId: number;
  amount: number;
  method: PayMethod;
  paidOn?: string;
  reference?: string;
  notes?: string;
}): Promise<void> {
  const body: Record<string, unknown> = {
    staff: input.staffId,
    amount: input.amount.toFixed(2),
    method: input.method,
    reference: (input.reference ?? '').trim(),
    notes: (input.notes ?? '').trim(),
  };
  if (input.paidOn) body.paid_on = input.paidOn;
  await api('/payroll/payments/', { method: 'POST', body });
}

export async function voidPayrollPayment(id: number, reason: string): Promise<void> {
  await api(`/payroll/payments/${id}/void/`, { method: 'POST', body: { reason } });
}

export function formatNpr(n: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(n);
}
