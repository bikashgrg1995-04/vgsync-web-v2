/**
 * Customers, from the API (/api/v1/customers/). They belong to the active
 * business, so switching branch shows that branch's customers.
 *
 * The API deactivates instead of deleting. The money figures are worked out
 * on the server from sales, payments, returns and credit use.
 */

import { api } from './api';
import {
  STATEMENT_TYPES as SHARED_TYPES,
  downloadPartyStatement,
  getPartyStatement,
  type StatementFilters,
} from './statements';

export type CustomerType = 'individual' | 'business' | 'fleet';

export interface Customer {
  id: number;
  name: string;
  type: CustomerType;
  phone: string;
  email: string;
  address: string;
  pan: string;
  notes: string;
  isActive: boolean;
  /** 0 means no limit is set. */
  creditLimit: number;
  /** True when what the customer owes is above the limit (a warning only). */
  overCreditLimit: boolean;
  /** What the customer still owes you. */
  creditToReceive: number;
  /** What you owe them (credit from returns not yet refunded or used). */
  creditToPay: number;
  /** Money taken on drafts that are not confirmed yet. */
  advanceReceived: number;
  totalSales: number;
  /** Replacement goods still to hand over. */
  stockToGive: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerInput {
  name: string;
  type?: CustomerType;
  phone?: string;
  email?: string;
  address?: string;
  pan?: string;
  notes?: string;
  creditLimit?: number;
  isActive?: boolean;
}

interface ApiCustomer {
  id: number;
  name: string;
  customer_type: CustomerType;
  phone: string;
  email: string;
  address: string;
  pan_number: string;
  notes: string;
  is_active: boolean;
  credit_limit: string;
  over_credit_limit: boolean;
  credit_to_receive: string;
  credit_to_pay: string;
  advance_received: string;
  total_sales: string;
  stock_to_give: string;
  created_at: string;
  updated_at: string;
}

interface Page<T> {
  count: number;
  next: string | null;
  results: T[];
}

const num = (value: string | number | null | undefined): number => Number(value ?? 0) || 0;

function fromApi(c: ApiCustomer): Customer {
  return {
    id: c.id,
    name: c.name,
    type: c.customer_type,
    phone: c.phone,
    email: c.email,
    address: c.address,
    pan: c.pan_number,
    notes: c.notes,
    isActive: c.is_active,
    creditLimit: num(c.credit_limit),
    overCreditLimit: c.over_credit_limit,
    creditToReceive: num(c.credit_to_receive),
    creditToPay: num(c.credit_to_pay),
    advanceReceived: num(c.advance_received),
    totalSales: num(c.total_sales),
    stockToGive: num(c.stock_to_give),
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

function toApi(input: CustomerInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: input.name.trim(),
    customer_type: input.type ?? 'individual',
    phone: (input.phone ?? '').trim(),
    email: (input.email ?? '').trim(),
    address: (input.address ?? '').trim(),
    pan_number: (input.pan ?? '').trim(),
    notes: (input.notes ?? '').trim(),
    credit_limit: String(Math.max(0, Number(input.creditLimit ?? 0) || 0)),
  };
  if (input.isActive !== undefined) body.is_active = input.isActive;
  return body;
}

/** Every customer of the active business (all pages). */
export async function listCustomers(): Promise<Customer[]> {
  const all: Customer[] = [];
  let page = 1;

  for (;;) {
    const data = await api<Page<ApiCustomer>>(`/customers/?page=${page}&page_size=100`);
    all.push(...data.results.map(fromApi));
    if (!data.next) break;
    page += 1;
  }

  return all;
}

/** Active customers only, for pickers such as the sale form. */
export async function listActiveCustomers(): Promise<Customer[]> {
  return (await listCustomers()).filter((c) => c.isActive);
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  return fromApi(await api<ApiCustomer>('/customers/', { method: 'POST', body: toApi(input) }));
}

export async function updateCustomer(id: number, input: CustomerInput): Promise<Customer> {
  return fromApi(await api<ApiCustomer>(`/customers/${id}/`, { method: 'PATCH', body: toApi(input) }));
}

/** Deactivate (the API never deletes a customer) or reactivate. */
export async function setCustomerActive(id: number, isActive: boolean): Promise<Customer> {
  return fromApi(
    await api<ApiCustomer>(`/customers/${id}/`, { method: 'PATCH', body: { is_active: isActive } }),
  );
}

export function getCustomerSummary(list: Customer[]) {
  return {
    total: list.length,
    active: list.filter((c) => c.isActive).length,
    withDues: list.filter((c) => c.creditToReceive > 0).length,
    receivable: list.reduce((sum, c) => sum + Math.max(0, c.creditToReceive), 0),
  };
}

// ---------- statement ----------

export type StatementType = 'sale' | 'payment' | 'return' | 'refund' | 'replacement' | 'adjustment';

export const STATEMENT_TYPES = SHARED_TYPES.customer as Record<StatementType, string>;

export type { StatementRow, Statement, StatementFilters } from './statements';

export function getStatement(id: number, filters: StatementFilters = {}, page = 1) {
  return getPartyStatement('customer', id, filters, page);
}

/** Download every statement row (not one page) as Excel or PDF. */
export function downloadStatement(id: number, file: 'xlsx' | 'pdf', filters: StatementFilters = {}) {
  return downloadPartyStatement('customer', id, file, filters);
}

export function formatNpr(n: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
    maximumFractionDigits: 0,
  }).format(n);
}

export const TYPE_LABEL: Record<CustomerType, string> = {
  individual: 'Individual',
  business: 'Business',
  fleet: 'Fleet',
};
