/**
 * Demo customers (branch-scoped).
 * Shared by Customers page, Sales, and future modules.
 * Replace with Django API later.
 */

export type CustomerType = 'individual' | 'business' | 'fleet';
export type CustomerStatus = 'active' | 'inactive' | 'blocked';

export interface Customer {
  id: string;
  branchCode: string;
  code: string;
  name: string;
  type: CustomerType;
  phone: string;
  email: string;
  address: string;
  city: string;
  pan: string;
  creditLimit: number;
  balance: number; // positive = receivable
  status: CustomerStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerInput {
  name: string;
  type: CustomerType;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  pan?: string;
  creditLimit?: number;
  status?: CustomerStatus;
  notes?: string;
}

const STORAGE_KEY = 'vgsync-customers';

const SEED: Customer[] = [
  {
    id: 'c-bhp-1',
    branchCode: 'BHP',
    code: 'CUS-BHP-001',
    name: 'Ram Bahadur Thapa',
    type: 'individual',
    phone: '9841001001',
    email: 'ram.thapa@email.com',
    address: 'Bharatpur-10, Chitwan',
    city: 'Bharatpur',
    pan: '',
    creditLimit: 50000,
    balance: 12500,
    status: 'active',
    notes: 'Regular service customer',
    createdAt: '2026-01-15',
    updatedAt: '2026-10-20',
  },
  {
    id: 'c-bhp-2',
    branchCode: 'BHP',
    code: 'CUS-BHP-002',
    name: 'Chitwan Auto Works',
    type: 'business',
    phone: '056-520100',
    email: 'accounts@chitwanauto.com',
    address: 'Narayangadh Highway',
    city: 'Bharatpur',
    pan: '301234567',
    creditLimit: 250000,
    balance: 87500,
    status: 'active',
    notes: 'Wholesale parts buyer',
    createdAt: '2026-02-01',
    updatedAt: '2026-11-01',
  },
  {
    id: 'c-bhp-3',
    branchCode: 'BHP',
    code: 'CUS-BHP-003',
    name: 'Sita Devi Sharma',
    type: 'individual',
    phone: '9801112233',
    email: '',
    address: 'Bharatpur-4',
    city: 'Bharatpur',
    pan: '',
    creditLimit: 20000,
    balance: 0,
    status: 'active',
    notes: '',
    createdAt: '2026-03-10',
    updatedAt: '2026-03-10',
  },
  {
    id: 'c-pkr-1',
    branchCode: 'PKR',
    code: 'CUS-PKR-001',
    name: 'Pokhara Fleet Services',
    type: 'fleet',
    phone: '061-460200',
    email: 'fleet@pkrfleet.com',
    address: 'Lakeside Road',
    city: 'Pokhara',
    pan: '309876543',
    creditLimit: 500000,
    balance: 142000,
    status: 'active',
    notes: 'Monthly settlement',
    createdAt: '2026-01-20',
    updatedAt: '2026-11-02',
  },
  {
    id: 'c-pkr-2',
    branchCode: 'PKR',
    code: 'CUS-PKR-002',
    name: 'Hari Krishna Gurung',
    type: 'individual',
    phone: '9856020304',
    email: 'hari.g@email.com',
    address: 'Mahendrapool',
    city: 'Pokhara',
    pan: '',
    creditLimit: 30000,
    balance: 4500,
    status: 'active',
    notes: '',
    createdAt: '2026-04-05',
    updatedAt: '2026-09-12',
  },
  {
    id: 'c-btl-1',
    branchCode: 'BTL',
    code: 'CUS-BTL-001',
    name: 'Butwal Transport Co.',
    type: 'fleet',
    phone: '071-540100',
    email: 'ops@btltransport.com',
    address: 'Traffic Chowk',
    city: 'Butwal',
    pan: '305551112',
    creditLimit: 300000,
    balance: 56000,
    status: 'active',
    notes: 'Credit terms 30 days',
    createdAt: '2026-02-18',
    updatedAt: '2026-10-28',
  },
  {
    id: 'c-btl-2',
    branchCode: 'BTL',
    code: 'CUS-BTL-002',
    name: 'Maya Kumari Poudel',
    type: 'individual',
    phone: '9847050607',
    email: '',
    address: 'Golpark',
    city: 'Butwal',
    pan: '',
    creditLimit: 15000,
    balance: 0,
    status: 'inactive',
    notes: 'Moved to another city',
    createdAt: '2026-05-01',
    updatedAt: '2026-08-15',
  },
  {
    id: 'c-ho-1',
    branchCode: 'HO',
    code: 'CUS-HO-001',
    name: 'National Logistics Pvt. Ltd.',
    type: 'business',
    phone: '01-4441000',
    email: 'procurement@natlog.com',
    address: 'Thapathali, Kathmandu',
    city: 'Kathmandu',
    pan: '600112233',
    creditLimit: 1000000,
    balance: 320000,
    status: 'active',
    notes: 'Corporate account',
    createdAt: '2026-01-05',
    updatedAt: '2026-11-01',
  },
];

function loadAll(): Customer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Customer[];
  } catch {}
  return structuredClone(SEED);
}

function saveAll(list: Customer[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export function ensureCustomersInitialized(): Customer[] {
  if (!localStorage.getItem(STORAGE_KEY)) {
    saveAll(structuredClone(SEED));
  }
  return loadAll();
}

/** Branch-scoped list — use in Customers page */
export function listCustomersByBranch(branchCode: string): Customer[] {
  ensureCustomersInitialized();
  return loadAll()
    .filter((c) => c.branchCode.toUpperCase() === branchCode.toUpperCase())
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Active customers only — for Sales / invoice pickers */
export function listActiveCustomers(branchCode: string): Customer[] {
  return listCustomersByBranch(branchCode).filter((c) => c.status === 'active');
}

export function getCustomerById(id: string): Customer | null {
  ensureCustomersInitialized();
  return loadAll().find((c) => c.id === id) ?? null;
}

export function getCustomerByCode(branchCode: string, code: string): Customer | null {
  ensureCustomersInitialized();
  const c = code.trim().toUpperCase();
  return (
    loadAll().find(
      (x) =>
        x.branchCode.toUpperCase() === branchCode.toUpperCase() &&
        x.code.toUpperCase() === c,
    ) ?? null
  );
}

function nextCode(branchCode: string, existing: Customer[]): string {
  const prefix = `CUS-${branchCode.toUpperCase()}-`;
  let max = 0;
  for (const c of existing) {
    if (!c.code.startsWith(prefix)) continue;
    const n = Number(c.code.slice(prefix.length));
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export function createCustomer(
  branchCode: string,
  input: CustomerInput,
): { ok: true; customer: Customer } | { ok: false; error: string } {
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (!name) return { ok: false, error: 'Name is required.' };
  if (!phone) return { ok: false, error: 'Phone is required.' };

  const all = ensureCustomersInitialized();
  const code = nextCode(branchCode, all);
  const now = new Date().toISOString().slice(0, 10);

  const customer: Customer = {
    id: `c-${Date.now()}`,
    branchCode: branchCode.toUpperCase(),
    code,
    name,
    type: input.type,
    phone,
    email: (input.email ?? '').trim(),
    address: (input.address ?? '').trim(),
    city: (input.city ?? '').trim(),
    pan: (input.pan ?? '').trim(),
    creditLimit: Number(input.creditLimit ?? 0) || 0,
    balance: 0,
    status: input.status ?? 'active',
    notes: (input.notes ?? '').trim(),
    createdAt: now,
    updatedAt: now,
  };

  all.push(customer);
  saveAll(all);
  return { ok: true, customer };
}

export function updateCustomer(
  id: string,
  input: CustomerInput,
): { ok: true; customer: Customer } | { ok: false; error: string } {
  const all = ensureCustomersInitialized();
  const idx = all.findIndex((c) => c.id === id);
  if (idx < 0) return { ok: false, error: 'Customer not found.' };

  const name = input.name.trim();
  const phone = input.phone.trim();
  if (!name) return { ok: false, error: 'Name is required.' };
  if (!phone) return { ok: false, error: 'Phone is required.' };

  all[idx] = {
    ...all[idx],
    name,
    type: input.type,
    phone,
    email: (input.email ?? '').trim(),
    address: (input.address ?? '').trim(),
    city: (input.city ?? '').trim(),
    pan: (input.pan ?? '').trim(),
    creditLimit: Number(input.creditLimit ?? all[idx].creditLimit) || 0,
    status: input.status ?? all[idx].status,
    notes: (input.notes ?? '').trim(),
    updatedAt: new Date().toISOString().slice(0, 10),
  };

  saveAll(all);
  return { ok: true, customer: all[idx] };
}

export function deleteCustomer(id: string): { ok: true } | { ok: false; error: string } {
  const all = ensureCustomersInitialized();
  const idx = all.findIndex((c) => c.id === id);
  if (idx < 0) return { ok: false, error: 'Customer not found.' };
  if (all[idx].balance !== 0) {
    return { ok: false, error: 'Cannot delete customer with outstanding balance. Set inactive instead.' };
  }
  all.splice(idx, 1);
  saveAll(all);
  return { ok: true };
}

export function getCustomerSummary(branchCode: string) {
  const list = listCustomersByBranch(branchCode);
  const active = list.filter((c) => c.status === 'active').length;
  const receivable = list.reduce((s, c) => s + Math.max(0, c.balance), 0);
  const blocked = list.filter((c) => c.status === 'blocked').length;
  return { total: list.length, active, receivable, blocked };
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

export const STATUS_LABEL: Record<CustomerStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  blocked: 'Blocked',
};
