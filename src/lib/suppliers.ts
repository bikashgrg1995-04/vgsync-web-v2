/**
 * Suppliers, from the API (/api/v1/suppliers/). They belong to the active
 * business, so switching branch shows that branch's suppliers.
 *
 * The API deactivates instead of deleting, and works out the money figures
 * (what is owed, advances, credit from returns) on the server.
 */

import { api } from './api';

export interface Supplier {
  id: number;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  pan: string;
  notes: string;
  isActive: boolean;
  /** Everything owed on ordered/received purchases, after payments. */
  creditToPay: number;
  /** Received but not yet paid. */
  outstanding: number;
  /** Ordered, still waiting for the goods. */
  toPayOnOrder: number;
  /** Already paid on purchases that have not arrived. */
  advancePaid: number;
  /** Credit from returned goods not yet refunded or used. */
  creditToReceive: number;
  totalPurchased: number;
  stockToReceive: number;
  stockPendingDelivery: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierInput {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  pan?: string;
  notes?: string;
  isActive?: boolean;
}

interface ApiSupplier {
  id: number;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  pan_number: string;
  notes: string;
  is_active: boolean;
  total_purchased: string;
  outstanding: string;
  advance_paid: string;
  credit_to_pay: string;
  to_pay_on_order: string;
  credit_to_receive: string;
  stock_to_receive: string;
  stock_pending_delivery: string;
  created_at: string;
  updated_at: string;
}

interface Page<T> {
  count: number;
  next: string | null;
  results: T[];
}

const num = (value: string | number | null | undefined): number => Number(value ?? 0) || 0;

function fromApi(s: ApiSupplier): Supplier {
  return {
    id: s.id,
    name: s.name,
    contactPerson: s.contact_person,
    phone: s.phone,
    email: s.email,
    address: s.address,
    pan: s.pan_number,
    notes: s.notes,
    isActive: s.is_active,
    creditToPay: num(s.credit_to_pay),
    outstanding: num(s.outstanding),
    toPayOnOrder: num(s.to_pay_on_order),
    advancePaid: num(s.advance_paid),
    creditToReceive: num(s.credit_to_receive),
    totalPurchased: num(s.total_purchased),
    stockToReceive: num(s.stock_to_receive),
    stockPendingDelivery: num(s.stock_pending_delivery),
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

function toApi(input: SupplierInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: input.name.trim(),
    contact_person: (input.contactPerson ?? '').trim(),
    phone: (input.phone ?? '').trim(),
    email: (input.email ?? '').trim(),
    address: (input.address ?? '').trim(),
    pan_number: (input.pan ?? '').trim(),
    notes: (input.notes ?? '').trim(),
  };
  if (input.isActive !== undefined) body.is_active = input.isActive;
  return body;
}

/** Every supplier of the active business (all pages). */
export async function listSuppliers(): Promise<Supplier[]> {
  const all: Supplier[] = [];
  let page = 1;

  for (;;) {
    const data = await api<Page<ApiSupplier>>(`/suppliers/?page=${page}&page_size=100`);
    all.push(...data.results.map(fromApi));
    if (!data.next) break;
    page += 1;
  }

  return all;
}

/** Active suppliers only, for pickers such as the purchase form. */
export async function listActiveSuppliers(): Promise<Supplier[]> {
  return (await listSuppliers()).filter((s) => s.isActive);
}

export async function getSupplier(id: number): Promise<Supplier> {
  return fromApi(await api<ApiSupplier>(`/suppliers/${id}/`));
}

export async function createSupplier(input: SupplierInput): Promise<Supplier> {
  return fromApi(await api<ApiSupplier>('/suppliers/', { method: 'POST', body: toApi(input) }));
}

export async function updateSupplier(id: number, input: SupplierInput): Promise<Supplier> {
  return fromApi(await api<ApiSupplier>(`/suppliers/${id}/`, { method: 'PATCH', body: toApi(input) }));
}

/** Deactivate (the API never deletes a supplier) or reactivate. */
export async function setSupplierActive(id: number, isActive: boolean): Promise<Supplier> {
  return fromApi(
    await api<ApiSupplier>(`/suppliers/${id}/`, { method: 'PATCH', body: { is_active: isActive } }),
  );
}

export function getSupplierSummary(list: Supplier[]) {
  return {
    total: list.length,
    active: list.filter((s) => s.isActive).length,
    inactive: list.filter((s) => !s.isActive).length,
    payable: list.reduce((sum, s) => sum + Math.max(0, s.creditToPay), 0),
  };
}

export function formatNpr(n: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
    maximumFractionDigits: 0,
  }).format(n);
}
