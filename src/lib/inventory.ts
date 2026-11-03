/**
 * Demo inventory data (branch-scoped).
 * Replace with Django API later.
 */

export type StockStatus = 'in_stock' | 'low' | 'out' | 'discontinued';

export interface StockItem {
  id: string;
  branchCode: string;
  sku: string;
  name: string;
  category: string;
  warehouse: string;
  unit: string;
  onHand: number;
  reserved: number;
  reorderLevel: number;
  unitCost: number;
  status: StockStatus;
  lastMovement: string; // ISO date
}

export interface StockMovement {
  id: string;
  branchCode: string;
  sku: string;
  productName: string;
  type: 'in' | 'out' | 'adjust' | 'transfer';
  qty: number;
  note: string;
  at: string;
  by: string;
}

const SEED_ITEMS: StockItem[] = [
  // Bharatpur
  {
    id: 'st-bhp-1',
    branchCode: 'BHP',
    sku: 'VG-ENG-001',
    name: 'Engine Oil 5W-30 4L',
    category: 'Lubricants',
    warehouse: 'WH-BHP-01',
    unit: 'pcs',
    onHand: 120,
    reserved: 8,
    reorderLevel: 40,
    unitCost: 1850,
    status: 'in_stock',
    lastMovement: '2026-11-01',
  },
  {
    id: 'st-bhp-2',
    branchCode: 'BHP',
    sku: 'VG-BRK-014',
    name: 'Front Brake Pad Set — City',
    category: 'Brakes',
    warehouse: 'WH-BHP-01',
    unit: 'set',
    onHand: 18,
    reserved: 2,
    reorderLevel: 20,
    unitCost: 3200,
    status: 'low',
    lastMovement: '2026-10-28',
  },
  {
    id: 'st-bhp-3',
    branchCode: 'BHP',
    sku: 'VG-FLT-003',
    name: 'Oil Filter — Generic',
    category: 'Filters',
    warehouse: 'WH-BHP-01',
    unit: 'pcs',
    onHand: 0,
    reserved: 0,
    reorderLevel: 25,
    unitCost: 450,
    status: 'out',
    lastMovement: '2026-10-20',
  },
  {
    id: 'st-bhp-4',
    branchCode: 'BHP',
    sku: 'VG-BAT-220',
    name: 'Battery 12V 45Ah',
    category: 'Electrical',
    warehouse: 'WH-BHP-02',
    unit: 'pcs',
    onHand: 34,
    reserved: 4,
    reorderLevel: 10,
    unitCost: 12500,
    status: 'in_stock',
    lastMovement: '2026-11-02',
  },
  {
    id: 'st-bhp-5',
    branchCode: 'BHP',
    sku: 'VG-TYR-185',
    name: 'Tyre 185/65 R15',
    category: 'Tyres',
    warehouse: 'WH-BHP-02',
    unit: 'pcs',
    onHand: 56,
    reserved: 12,
    reorderLevel: 16,
    unitCost: 9800,
    status: 'in_stock',
    lastMovement: '2026-11-03',
  },
  // Pokhara
  {
    id: 'st-pkr-1',
    branchCode: 'PKR',
    sku: 'VG-ENG-001',
    name: 'Engine Oil 5W-30 4L',
    category: 'Lubricants',
    warehouse: 'WH-PKR-01',
    unit: 'pcs',
    onHand: 64,
    reserved: 0,
    reorderLevel: 30,
    unitCost: 1850,
    status: 'in_stock',
    lastMovement: '2026-10-30',
  },
  {
    id: 'st-pkr-2',
    branchCode: 'PKR',
    sku: 'VG-CLH-010',
    name: 'Clutch Plate — Alto',
    category: 'Transmission',
    warehouse: 'WH-PKR-01',
    unit: 'pcs',
    onHand: 9,
    reserved: 1,
    reorderLevel: 12,
    unitCost: 5400,
    status: 'low',
    lastMovement: '2026-10-25',
  },
  {
    id: 'st-pkr-3',
    branchCode: 'PKR',
    sku: 'VG-SPK-002',
    name: 'Spark Plug Iridium',
    category: 'Ignition',
    warehouse: 'WH-PKR-01',
    unit: 'pcs',
    onHand: 200,
    reserved: 20,
    reorderLevel: 50,
    unitCost: 850,
    status: 'in_stock',
    lastMovement: '2026-11-01',
  },
  // Butwal
  {
    id: 'st-btl-1',
    branchCode: 'BTL',
    sku: 'VG-ENG-001',
    name: 'Engine Oil 5W-30 4L',
    category: 'Lubricants',
    warehouse: 'WH-BTL-01',
    unit: 'pcs',
    onHand: 42,
    reserved: 6,
    reorderLevel: 25,
    unitCost: 1850,
    status: 'in_stock',
    lastMovement: '2026-10-29',
  },
  {
    id: 'st-btl-2',
    branchCode: 'BTL',
    sku: 'VG-WIP-001',
    name: 'Wiper Blade 20"',
    category: 'Accessories',
    warehouse: 'WH-BTL-01',
    unit: 'pcs',
    onHand: 7,
    reserved: 0,
    reorderLevel: 15,
    unitCost: 650,
    status: 'low',
    lastMovement: '2026-10-18',
  },
  {
    id: 'st-btl-3',
    branchCode: 'BTL',
    sku: 'VG-AIR-004',
    name: 'Cabin Air Filter',
    category: 'Filters',
    warehouse: 'WH-BTL-01',
    unit: 'pcs',
    onHand: 0,
    reserved: 0,
    reorderLevel: 20,
    unitCost: 1200,
    status: 'out',
    lastMovement: '2026-09-30',
  },
  // HO warehouse sample
  {
    id: 'st-ho-1',
    branchCode: 'HO',
    sku: 'VG-ENG-001',
    name: 'Engine Oil 5W-30 4L',
    category: 'Lubricants',
    warehouse: 'WH-HO-CENTRAL',
    unit: 'pcs',
    onHand: 500,
    reserved: 40,
    reorderLevel: 100,
    unitCost: 1720,
    status: 'in_stock',
    lastMovement: '2026-11-03',
  },
  {
    id: 'st-ho-2',
    branchCode: 'HO',
    sku: 'VG-BAT-220',
    name: 'Battery 12V 45Ah',
    category: 'Electrical',
    warehouse: 'WH-HO-CENTRAL',
    unit: 'pcs',
    onHand: 80,
    reserved: 10,
    reorderLevel: 20,
    unitCost: 11800,
    status: 'in_stock',
    lastMovement: '2026-11-02',
  },
];

const SEED_MOVEMENTS: StockMovement[] = [
  {
    id: 'mv-1',
    branchCode: 'BHP',
    sku: 'VG-TYR-185',
    productName: 'Tyre 185/65 R15',
    type: 'in',
    qty: 20,
    note: 'PO-1042 received',
    at: '2026-11-03T09:20:00',
    by: 'Sujan Shrestha',
  },
  {
    id: 'mv-2',
    branchCode: 'BHP',
    sku: 'VG-BRK-014',
    productName: 'Front Brake Pad Set — City',
    type: 'out',
    qty: 4,
    note: 'SO-882 issue',
    at: '2026-11-02T15:10:00',
    by: 'Anita Thapa',
  },
  {
    id: 'mv-3',
    branchCode: 'PKR',
    sku: 'VG-SPK-002',
    productName: 'Spark Plug Iridium',
    type: 'adjust',
    qty: -2,
    note: 'Damaged in transit',
    at: '2026-11-01T11:00:00',
    by: 'Gita Sharma',
  },
  {
    id: 'mv-4',
    branchCode: 'HO',
    sku: 'VG-ENG-001',
    productName: 'Engine Oil 5W-30 4L',
    type: 'transfer',
    qty: -40,
    note: 'Transfer to BHP',
    at: '2026-10-31T08:45:00',
    by: 'System Admin',
  },
];

const ITEMS_KEY = 'vgsync-inventory-items';
const MOVES_KEY = 'vgsync-inventory-moves';

function loadItems(): StockItem[] {
  try {
    const raw = localStorage.getItem(ITEMS_KEY);
    if (raw) return JSON.parse(raw) as StockItem[];
  } catch {}
  return structuredClone(SEED_ITEMS);
}

function saveItems(items: StockItem[]): void {
  try {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
  } catch {}
}

function loadMoves(): StockMovement[] {
  try {
    const raw = localStorage.getItem(MOVES_KEY);
    if (raw) return JSON.parse(raw) as StockMovement[];
  } catch {}
  return structuredClone(SEED_MOVEMENTS);
}

function saveMoves(moves: StockMovement[]): void {
  try {
    localStorage.setItem(MOVES_KEY, JSON.stringify(moves));
  } catch {}
}

export function ensureInventoryInitialized(): void {
  if (!localStorage.getItem(ITEMS_KEY)) saveItems(structuredClone(SEED_ITEMS));
  if (!localStorage.getItem(MOVES_KEY)) saveMoves(structuredClone(SEED_MOVEMENTS));
}

function deriveStatus(item: StockItem): StockStatus {
  if (item.status === 'discontinued') return 'discontinued';
  if (item.onHand <= 0) return 'out';
  if (item.onHand <= item.reorderLevel) return 'low';
  return 'in_stock';
}

export function listStockByBranch(branchCode: string): StockItem[] {
  ensureInventoryInitialized();
  return loadItems()
    .filter((i) => i.branchCode.toUpperCase() === branchCode.toUpperCase())
    .map((i) => ({ ...i, status: deriveStatus(i) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listMovementsByBranch(branchCode: string): StockMovement[] {
  ensureInventoryInitialized();
  return loadMoves()
    .filter((m) => m.branchCode.toUpperCase() === branchCode.toUpperCase())
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function getInventorySummary(branchCode: string) {
  const items = listStockByBranch(branchCode);
  const skuCount = items.length;
  const onHandUnits = items.reduce((s, i) => s + i.onHand, 0);
  const stockValue = items.reduce((s, i) => s + i.onHand * i.unitCost, 0);
  const lowCount = items.filter((i) => i.status === 'low').length;
  const outCount = items.filter((i) => i.status === 'out').length;
  return { skuCount, onHandUnits, stockValue, lowCount, outCount };
}

export function adjustStock(
  itemId: string,
  delta: number,
  note: string,
  by: string,
): { ok: true; item: StockItem } | { ok: false; error: string } {
  const items = loadItems();
  const idx = items.findIndex((i) => i.id === itemId);
  if (idx < 0) return { ok: false, error: 'Item not found.' };

  const next = items[idx].onHand + delta;
  if (next < 0) return { ok: false, error: 'Stock cannot go below zero in this demo.' };

  items[idx] = {
    ...items[idx],
    onHand: next,
    lastMovement: new Date().toISOString().slice(0, 10),
  };
  items[idx].status = deriveStatus(items[idx]);
  saveItems(items);

  const moves = loadMoves();
  moves.unshift({
    id: `mv-${Date.now()}`,
    branchCode: items[idx].branchCode,
    sku: items[idx].sku,
    productName: items[idx].name,
    type: 'adjust',
    qty: delta,
    note: note || 'Manual adjustment',
    at: new Date().toISOString(),
    by,
  });
  saveMoves(moves);

  return { ok: true, item: items[idx] };
}

export function formatNpr(n: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
    maximumFractionDigits: 0,
  }).format(n);
}

export const STATUS_LABEL: Record<StockStatus, string> = {
  in_stock: 'In stock',
  low: 'Low stock',
  out: 'Out of stock',
  discontinued: 'Discontinued',
};
