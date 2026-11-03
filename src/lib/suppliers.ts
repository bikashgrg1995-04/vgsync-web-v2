/**
 * Demo suppliers (branch-scoped).
 * Shared by Suppliers page, Purchase, and payables.
 * Replace with Django API later.
 */

export type SupplierType = 'local' | 'importer' | 'manufacturer' | 'distributor';
export type SupplierStatus = 'active' | 'inactive' | 'blocked';

export interface Supplier {
  id: string;
  branchCode: string;
  code: string;
  name: string;
  type: SupplierType;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  pan: string;
  paymentTerms: string;
  creditLimit: number;
  balance: number; // positive = payable to supplier
  status: SupplierStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierInput {
  name: string;
  type: SupplierType;
  contactPerson?: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  pan?: string;
  paymentTerms?: string;
  creditLimit?: number;
  status?: SupplierStatus;
  notes?: string;
}

const STORAGE_KEY = 'vgsync-suppliers';

const SEED: Supplier[] = [
  {
    id: 's-bhp-1',
    branchCode: 'BHP',
    code: 'SUP-BHP-001',
    name: 'Himalayan Lubricants Pvt. Ltd.',
    type: 'distributor',
    contactPerson: 'Rajesh Adhikari',
    phone: '01-5551200',
    email: 'sales@himalayanlube.com',
    address: 'Balaju Industrial Area',
    city: 'Kathmandu',
    pan: '600998877',
    paymentTerms: 'Net 30',
    creditLimit: 500000,
    balance: 125000,
    status: 'active',
    notes: 'Primary oil & filter supplier',
    createdAt: '2026-01-10',
    updatedAt: '2026-10-15',
  },
  {
    id: 's-bhp-2',
    branchCode: 'BHP',
    code: 'SUP-BHP-002',
    name: 'Chitwan Spare Hub',
    type: 'local',
    contactPerson: 'Bikash K.C.',
    phone: '056-521800',
    email: 'chitwanspare@email.com',
    address: 'Narayangadh',
    city: 'Bharatpur',
    pan: '301112223',
    paymentTerms: 'Cash / 7 days',
    creditLimit: 100000,
    balance: 18500,
    status: 'active',
    notes: 'Local fast-moving parts',
    createdAt: '2026-02-20',
    updatedAt: '2026-11-01',
  },
  {
    id: 's-pkr-1',
    branchCode: 'PKR',
    code: 'SUP-PKR-001',
    name: 'Lakeside Auto Imports',
    type: 'importer',
    contactPerson: 'Sunita Gurung',
    phone: '061-461500',
    email: 'import@lakesideauto.com',
    address: 'Birauta',
    city: 'Pokhara',
    pan: '309990011',
    paymentTerms: 'Net 45',
    creditLimit: 800000,
    balance: 210000,
    status: 'active',
    notes: 'OEM equivalent imports',
    createdAt: '2026-01-25',
    updatedAt: '2026-10-28',
  },
  {
    id: 's-pkr-2',
    branchCode: 'PKR',
    code: 'SUP-PKR-002',
    name: 'Annapurna Tyres',
    type: 'distributor',
    contactPerson: 'Prakash Thapa',
    phone: '9856011122',
    email: '',
    address: 'Zero KM',
    city: 'Pokhara',
    pan: '',
    paymentTerms: 'COD',
    creditLimit: 150000,
    balance: 0,
    status: 'active',
    notes: '',
    createdAt: '2026-03-12',
    updatedAt: '2026-09-01',
  },
  {
    id: 's-btl-1',
    branchCode: 'BTL',
    code: 'SUP-BTL-001',
    name: 'Western Nepal Batteries',
    type: 'distributor',
    contactPerson: 'Dinesh Sharma',
    phone: '071-541200',
    email: 'orders@wnbatteries.com',
    address: 'Bus Park Road',
    city: 'Butwal',
    pan: '305554433',
    paymentTerms: 'Net 15',
    creditLimit: 200000,
    balance: 42000,
    status: 'active',
    notes: 'Battery & electrical',
    createdAt: '2026-02-08',
    updatedAt: '2026-10-20',
  },
  {
    id: 's-btl-2',
    branchCode: 'BTL',
    code: 'SUP-BTL-002',
    name: 'Terai Filters Traders',
    type: 'local',
    contactPerson: 'Kamal Rai',
    phone: '9847022334',
    email: '',
    address: 'Golpark',
    city: 'Butwal',
    pan: '',
    paymentTerms: 'Cash',
    creditLimit: 50000,
    balance: 0,
    status: 'inactive',
    notes: 'Seasonal supplier',
    createdAt: '2026-04-01',
    updatedAt: '2026-08-10',
  },
  {
    id: 's-ho-1',
    branchCode: 'HO',
    code: 'SUP-HO-001',
    name: 'Global Parts International',
    type: 'manufacturer',
    contactPerson: 'Export Desk',
    phone: '01-4442000',
    email: 'np@globalparts.int',
    address: 'New Baneshwor',
    city: 'Kathmandu',
    pan: '600123456',
    paymentTerms: 'LC / Net 60',
    creditLimit: 2000000,
    balance: 450000,
    status: 'active',
    notes: 'Central procurement',
    createdAt: '2026-01-05',
    updatedAt: '2026-11-01',
  },
  {
    id: 's-ho-2',
    branchCode: 'HO',
    code: 'SUP-HO-002',
    name: 'Nepal Rubber Industries',
    type: 'manufacturer',
    contactPerson: 'Sales HO',
    phone: '01-5558800',
    email: 'b2b@nepalrubber.com',
    address: 'Hetauda Industrial',
    city: 'Hetauda',
    pan: '601112233',
    paymentTerms: 'Net 30',
    creditLimit: 750000,
    balance: 98000,
    status: 'active',
    notes: 'Tyres & tubes',
    createdAt: '2026-01-18',
    updatedAt: '2026-10-12',
  },
];

function loadAll(): Supplier[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Supplier[];
  } catch {}
  return structuredClone(SEED);
}

function saveAll(list: Supplier[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export function ensureSuppliersInitialized(): Supplier[] {
  if (!localStorage.getItem(STORAGE_KEY)) {
    saveAll(structuredClone(SEED));
  }
  return loadAll();
}

export function listSuppliersByBranch(branchCode: string): Supplier[] {
  ensureSuppliersInitialized();
  return loadAll()
    .filter((s) => s.branchCode.toUpperCase() === branchCode.toUpperCase())
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Active only — for Purchase order pickers */
export function listActiveSuppliers(branchCode: string): Supplier[] {
  return listSuppliersByBranch(branchCode).filter((s) => s.status === 'active');
}

export function getSupplierById(id: string): Supplier | null {
  ensureSuppliersInitialized();
  return loadAll().find((s) => s.id === id) ?? null;
}

export function getSupplierByCode(branchCode: string, code: string): Supplier | null {
  ensureSuppliersInitialized();
  const c = code.trim().toUpperCase();
  return (
    loadAll().find(
      (x) =>
        x.branchCode.toUpperCase() === branchCode.toUpperCase() &&
        x.code.toUpperCase() === c,
    ) ?? null
  );
}

function nextCode(branchCode: string, existing: Supplier[]): string {
  const prefix = `SUP-${branchCode.toUpperCase()}-`;
  let max = 0;
  for (const s of existing) {
    if (!s.code.startsWith(prefix)) continue;
    const n = Number(s.code.slice(prefix.length));
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export function createSupplier(
  branchCode: string,
  input: SupplierInput,
): { ok: true; supplier: Supplier } | { ok: false; error: string } {
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (!name) return { ok: false, error: 'Name is required.' };
  if (!phone) return { ok: false, error: 'Phone is required.' };

  const all = ensureSuppliersInitialized();
  const code = nextCode(branchCode, all);
  const now = new Date().toISOString().slice(0, 10);

  const supplier: Supplier = {
    id: `s-${Date.now()}`,
    branchCode: branchCode.toUpperCase(),
    code,
    name,
    type: input.type,
    contactPerson: (input.contactPerson ?? '').trim(),
    phone,
    email: (input.email ?? '').trim(),
    address: (input.address ?? '').trim(),
    city: (input.city ?? '').trim(),
    pan: (input.pan ?? '').trim(),
    paymentTerms: (input.paymentTerms ?? 'Net 30').trim() || 'Net 30',
    creditLimit: Number(input.creditLimit ?? 0) || 0,
    balance: 0,
    status: input.status ?? 'active',
    notes: (input.notes ?? '').trim(),
    createdAt: now,
    updatedAt: now,
  };

  all.push(supplier);
  saveAll(all);
  return { ok: true, supplier };
}

export function updateSupplier(
  id: string,
  input: SupplierInput,
): { ok: true; supplier: Supplier } | { ok: false; error: string } {
  const all = ensureSuppliersInitialized();
  const idx = all.findIndex((s) => s.id === id);
  if (idx < 0) return { ok: false, error: 'Supplier not found.' };

  const name = input.name.trim();
  const phone = input.phone.trim();
  if (!name) return { ok: false, error: 'Name is required.' };
  if (!phone) return { ok: false, error: 'Phone is required.' };

  all[idx] = {
    ...all[idx],
    name,
    type: input.type,
    contactPerson: (input.contactPerson ?? '').trim(),
    phone,
    email: (input.email ?? '').trim(),
    address: (input.address ?? '').trim(),
    city: (input.city ?? '').trim(),
    pan: (input.pan ?? '').trim(),
    paymentTerms: (input.paymentTerms ?? all[idx].paymentTerms).trim(),
    creditLimit: Number(input.creditLimit ?? all[idx].creditLimit) || 0,
    status: input.status ?? all[idx].status,
    notes: (input.notes ?? '').trim(),
    updatedAt: new Date().toISOString().slice(0, 10),
  };

  saveAll(all);
  return { ok: true, supplier: all[idx] };
}

export function deleteSupplier(id: string): { ok: true } | { ok: false; error: string } {
  const all = ensureSuppliersInitialized();
  const idx = all.findIndex((s) => s.id === id);
  if (idx < 0) return { ok: false, error: 'Supplier not found.' };
  if (all[idx].balance !== 0) {
    return {
      ok: false,
      error: 'Cannot delete supplier with outstanding payable. Set inactive instead.',
    };
  }
  all.splice(idx, 1);
  saveAll(all);
  return { ok: true };
}

export function getSupplierSummary(branchCode: string) {
  const list = listSuppliersByBranch(branchCode);
  const active = list.filter((s) => s.status === 'active').length;
  const payable = list.reduce((sum, s) => sum + Math.max(0, s.balance), 0);
  const blocked = list.filter((s) => s.status === 'blocked').length;
  return { total: list.length, active, payable, blocked };
}

export function formatNpr(n: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
    maximumFractionDigits: 0,
  }).format(n);
}

export const TYPE_LABEL: Record<SupplierType, string> = {
  local: 'Local',
  importer: 'Importer',
  manufacturer: 'Manufacturer',
  distributor: 'Distributor',
};

export const STATUS_LABEL: Record<SupplierStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  blocked: 'Blocked',
};
