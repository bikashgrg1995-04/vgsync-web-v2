/**
 * Reports, from the API (/api/v1/reports/). Owner only, read-only.
 * Money comes back as strings; everything here is turned into numbers.
 */

import { api, apiDownload } from './api';

export type ReportId =
  | 'profit-loss'
  | 'receivables'
  | 'payables'
  | 'stock-value'
  | 'sales-trend'
  | 'top-products'
  | 'top-customers'
  | 'top-suppliers'
  | 'payroll-summary';

export interface ReportParams {
  dateFrom?: string;
  dateTo?: string;
  groupBy?: 'day' | 'week' | 'month';
  by?: 'value' | 'quantity';
  limit?: number;
}

export interface ReportMeta {
  id: ReportId;
  label: string;
  hint: string;
  /** Which controls apply. */
  dates: boolean;
  groupBy?: boolean;
  by?: boolean;
  limit?: boolean;
}

export const REPORTS: ReportMeta[] = [
  { id: 'profit-loss', label: 'Profit & loss', hint: 'Cash basis: money in against money out.', dates: true },
  { id: 'receivables', label: 'Receivables', hint: 'What customers owe you, by age.', dates: false },
  { id: 'payables', label: 'Payables', hint: 'What you owe suppliers, by age.', dates: false },
  { id: 'stock-value', label: 'Stock value', hint: 'Stock on hand at purchase price.', dates: false },
  { id: 'sales-trend', label: 'Sales trend', hint: 'Confirmed sales, less returns.', dates: true, groupBy: true },
  { id: 'top-products', label: 'Top products', hint: 'Best sellers.', dates: true, by: true, limit: true },
  { id: 'top-customers', label: 'Top customers', hint: 'Who buys the most.', dates: true, limit: true },
  { id: 'top-suppliers', label: 'Top suppliers', hint: 'Who you buy the most from.', dates: true, limit: true },
  { id: 'payroll-summary', label: 'Payroll', hint: 'What staff earned and were paid.', dates: true },
];

const num = (v: string | number | null | undefined): number => Number(v ?? 0) || 0;

// ---- Result shapes -----------------------------------------------------

export interface ProfitLoss {
  income: { total: number; saleRefunds: number; net: number; byCategory: { category: string; total: number }[] };
  expenses: { total: number; purchaseRefunds: number; net: number; byCategory: { category: string; total: number }[] };
  profit: number;
  byMonth: { month: string; income: number; expenses: number; profit: number }[];
}

export interface Ageing {
  total: number;
  buckets: { current: number; d31_60: number; d61_90: number; over90: number };
  /** Receivables only: EMI sales are kept apart, their instalments fall due over months. */
  emiOutstanding?: number;
  parties: { id: number; name: string; current: number; d31_60: number; d61_90: number; over90: number; total: number }[];
}

export interface StockValue {
  goodValue: number;
  damagedValue: number;
  totalValue: number;
  goodUnits: number;
  damagedUnits: number;
  productsWithoutPrice: number;
  products: {
    stockNo: string;
    name: string;
    purchasePrice: number;
    quantity: number;
    damagedQuantity: number;
    goodValue: number;
    damagedValue: number;
  }[];
}

export interface SalesTrend {
  groupBy: string;
  sales: number;
  total: number;
  returns: number;
  net: number;
  periods: { period: string; sales: number; total: number; returns: number; net: number }[];
}

export interface TopProducts {
  products: { stockNo: string; name: string; quantity: number; returnedQuantity: number; netQuantity: number; revenue: number }[];
}

export interface TopCustomers {
  customers: { id: number; name: string; sales: number; total: number; returns: number }[];
  walkIn: { sales: number; total: number };
}

export interface TopSuppliers {
  suppliers: { id: number; name: string; purchases: number; total: number }[];
}

export interface Payroll {
  earned: number;
  paid: number;
  owedNow: number;
  staff: { staff: number; name: string; earned: number; paid: number; owedNow: number }[];
  byMonth: { month: string; earned: number; paid: number }[];
}

export type ReportData =
  | { id: 'profit-loss'; data: ProfitLoss }
  | { id: 'receivables'; data: Ageing }
  | { id: 'payables'; data: Ageing }
  | { id: 'stock-value'; data: StockValue }
  | { id: 'sales-trend'; data: SalesTrend }
  | { id: 'top-products'; data: TopProducts }
  | { id: 'top-customers'; data: TopCustomers }
  | { id: 'top-suppliers'; data: TopSuppliers }
  | { id: 'payroll-summary'; data: Payroll };

// ---- Mapping -----------------------------------------------------------

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const category = (r: Raw) => ({ category: String(r.category), total: num(r.total) });

function ageing(r: Raw): Ageing {
  const parties = (r.parties as Raw[]).map((p) => ({
    id: p.id,
    name: p.name,
    current: num(p.current),
    d31_60: num(p['31_60']),
    d61_90: num(p['61_90']),
    over90: num(p.over_90),
    total: num(p.total),
  }));
  return {
    total: num(r.total),
    buckets: {
      current: num(r.buckets.current),
      d31_60: num(r.buckets['31_60']),
      d61_90: num(r.buckets['61_90']),
      over90: num(r.buckets.over_90),
    },
    emiOutstanding: r.emi_outstanding === undefined ? undefined : num(r.emi_outstanding),
    parties,
  };
}

function query(params: ReportParams, meta: ReportMeta, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams(extra);
  if (meta.dates && params.dateFrom) q.set('date_from', params.dateFrom);
  if (meta.dates && params.dateTo) q.set('date_to', params.dateTo);
  if (meta.groupBy && params.groupBy) q.set('group_by', params.groupBy);
  if (meta.by && params.by) q.set('by', params.by);
  if (meta.limit && params.limit) q.set('limit', String(params.limit));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function metaOf(id: ReportId): ReportMeta {
  return REPORTS.find((r) => r.id === id)!;
}

export async function loadReport(id: ReportId, params: ReportParams): Promise<ReportData> {
  const meta = metaOf(id);
  const r = await api<Raw>(`/reports/${id}/${query(params, meta)}`);

  switch (id) {
    case 'profit-loss':
      return {
        id,
        data: {
          income: {
            total: num(r.income.total),
            saleRefunds: num(r.income.sale_refunds),
            net: num(r.income.net),
            byCategory: (r.income.by_category as Raw[]).map(category),
          },
          expenses: {
            total: num(r.expenses.total),
            purchaseRefunds: num(r.expenses.purchase_refunds),
            net: num(r.expenses.net),
            byCategory: (r.expenses.by_category as Raw[]).map(category),
          },
          profit: num(r.profit),
          byMonth: (r.by_month as Raw[]).map((m) => ({
            month: m.month,
            income: num(m.income),
            expenses: num(m.expenses),
            profit: num(m.profit),
          })),
        },
      };
    case 'receivables':
    case 'payables':
      return { id, data: ageing(r) };
    case 'stock-value':
      return {
        id,
        data: {
          goodValue: num(r.good_value),
          damagedValue: num(r.damaged_value),
          totalValue: num(r.total_value),
          goodUnits: num(r.good_units),
          damagedUnits: num(r.damaged_units),
          productsWithoutPrice: r.products_without_price ?? 0,
          products: (r.products as Raw[]).map((p) => ({
            stockNo: p.stock_no,
            name: p.name,
            purchasePrice: num(p.purchase_price),
            quantity: num(p.quantity),
            damagedQuantity: num(p.damaged_quantity),
            goodValue: num(p.good_value),
            damagedValue: num(p.damaged_value),
          })),
        },
      };
    case 'sales-trend':
      return {
        id,
        data: {
          groupBy: r.group_by,
          sales: r.sales ?? 0,
          total: num(r.total),
          returns: num(r.returns),
          net: num(r.net),
          periods: (r.periods as Raw[]).map((p) => ({
            period: p.period,
            sales: p.sales ?? 0,
            total: num(p.total),
            returns: num(p.returns),
            net: num(p.net),
          })),
        },
      };
    case 'top-products':
      return {
        id,
        data: {
          products: (r.products as Raw[]).map((p) => ({
            stockNo: p.stock_no ?? '',
            name: p.name,
            quantity: num(p.quantity),
            returnedQuantity: num(p.returned_quantity),
            netQuantity: num(p.net_quantity),
            revenue: num(p.revenue),
          })),
        },
      };
    case 'top-customers':
      return {
        id,
        data: {
          customers: (r.customers as Raw[]).map((c) => ({
            id: c.id,
            name: c.name,
            sales: c.sales ?? 0,
            total: num(c.total),
            returns: num(c.returns),
          })),
          walkIn: { sales: r.walk_in?.sales ?? 0, total: num(r.walk_in?.total) },
        },
      };
    case 'top-suppliers':
      return {
        id,
        data: {
          suppliers: (r.suppliers as Raw[]).map((s) => ({
            id: s.id,
            name: s.name,
            purchases: s.purchases ?? 0,
            total: num(s.total),
          })),
        },
      };
    case 'payroll-summary':
      return {
        id,
        data: {
          earned: num(r.earned),
          paid: num(r.paid),
          owedNow: num(r.owed_now),
          staff: (r.staff as Raw[]).map((s) => ({
            staff: s.staff,
            name: s.name,
            earned: num(s.earned),
            paid: num(s.paid),
            owedNow: num(s.owed_now),
          })),
          byMonth: (r.by_month as Raw[]).map((m) => ({ month: m.month, earned: num(m.earned), paid: num(m.paid) })),
        },
      };
  }
}

/** The same report as an Excel or PDF file, with the same filters. */
export function downloadReport(id: ReportId, file: 'xlsx' | 'pdf', params: ReportParams): Promise<void> {
  const meta = metaOf(id);
  return apiDownload(`/reports/${id}/${query(params, meta, { export: file })}`, `${id}.${file}`);
}

export function formatNpr(n: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(n);
}

export function formatQty(n: number): string {
  return new Intl.NumberFormat('en-NP', { maximumFractionDigits: 3 }).format(n);
}

// ---------- owner dashboard ----------

export interface DashboardBranch {
  id: number;
  name: string;
  business_code: string;
  sales_today: string;
  sales_month: string;
  purchases_month: string;
  profit_month: string;
  receivables: string;
  low_stock: number;
}

export interface Dashboard {
  as_of: string;
  business: { id: number; name: string; business_type: string };
  access_mode: 'full' | 'read_only';
  sales_today: string;
  sales_month: string;
  purchases_month: string;
  profit_month: string;
  income_month: string;
  expenses_month: string;
  receivables: string;
  payables: string;
  cash: { cash: string; bank: string; other: string; total: string };
  stock: { value: string; damaged_value: string };
  sales_trend: Array<{ date: string; total: string }>;
  income_expense_by_month: Array<{ month: string; income: string; expenses: string; profit: string }>;
  top_products: Array<{ name: string; quantity: string; revenue: string }>;
  low_stock: { count: number; items: Array<{ product: number; name: string; quantity: string; reorder_level: string }> };
  approvals_pending: number;
  staff: { total: number; active: number; without_position: number };
  alerts: Array<{ kind: string; severity: 'info' | 'warning' | 'danger'; message: string }>;
  /** Head Office only: its branches, read-only. */
  branches?: DashboardBranch[];
}

/** One call, real numbers from the API (needs the dashboard.view permission). */
export function loadDashboard(): Promise<Dashboard> {
  return api<Dashboard>('/reports/dashboard/');
}
