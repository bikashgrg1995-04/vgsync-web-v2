
/**
 * Inventory, from the API (/api/v1/inventory/).
 *
 * The product catalog belongs to the Head Office (or an independent
 * business); branches read it and keep their own stock. Stock is never
 * edited directly: every change is an immutable movement, and the server
 * works out the balance and the stock status.
 */

import { api } from './api';

// ==================================================
// TYPES
// ==================================================

export type StockStatus = 'in_stock' | 'low' | 'out';

export interface StockItem {
  productId: number;
  stockNo: string;
  name: string;
  brand: string;
  model: string;
  category: string;
  group: string;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  mrp: number;
  reorderLevel: number;
  image: string | null;

  /** Good stock that can be sold. */
  quantity: number;

  damagedQuantity: number;
  totalQuantity: number;
  status: StockStatus;
}

export interface ProductInput {
  stockNo: string;
  name: string;
  brand?: string;
  model?: string;
  category?: string;
  group?: string;
  unit?: string;
  purchasePrice?: number;
  salePrice?: number;
  mrp?: number;
  reorderLevel?: number;
}

export type MovementType =
  | 'opening'
  | 'purchase_receipt'
  | 'sale_issue'
  | 'sale_return'
  | 'purchase_return'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'transfer_in'
  | 'transfer_out'
  | 'reversal';

export type StockCondition = 'good' | 'damaged';

export interface StockMovement {
  id: number;
  productId: number;
  stockNo: string;
  productName: string;
  condition: StockCondition;
  type: MovementType;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  reference: string;
  notes: string;
  createdByName: string;
  createdAt: string;
}

export interface MovementFilters {
  productId?: number;
  type?: MovementType | '';
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface MovementPage {
  count: number;
  hasNext: boolean;
  results: StockMovement[];
}

// ==================================================
// STOCK ADJUSTMENT TYPES
// ==================================================

export type AdjustmentMode =
  | 'increase'
  | 'decrease'
  | 'mark_damaged'
  | 'remove_damaged';

export type AdjustmentAction =
  | 'increase'
  | 'decrease'
  | 'remove_damaged';

export type AdjustmentReason =
  | 'received'
  | 'found'
  | 'count_correction'
  | 'damaged'
  | 'lost'
  | 'expired'
  | 'used'
  | 'disposed'
  | 'written_off'
  | 'other';

export interface AdjustmentOption {
  value: AdjustmentMode;
  label: string;
  reasons: {
    value: AdjustmentReason;
    label: string;
  }[];
}

/**
 * Available manual stock adjustment actions and their reasons.
 */
export const ADJUSTMENT_OPTIONS: AdjustmentOption[] = [
  {
    value: 'increase',
    label: 'Increase good stock',
    reasons: [
      {
        value: 'received',
        label: 'Additional stock received',
      },
      {
        value: 'found',
        label: 'Previously missing stock found',
      },
      {
        value: 'count_correction',
        label: 'Stock count correction',
      },
      {
        value: 'other',
        label: 'Other',
      },
    ],
  },
  {
    value: 'decrease',
    label: 'Decrease good stock',
    reasons: [
      {
        value: 'lost',
        label: 'Lost or missing',
      },
      {
        value: 'expired',
        label: 'Expired stock',
      },
      {
        value: 'used',
        label: 'Used stock',
      },
      {
        value: 'count_correction',
        label: 'Stock count correction',
      },
      {
        value: 'other',
        label: 'Other',
      },
    ],
  },
  {
    value: 'mark_damaged',
    label: 'Mark as damaged',
    reasons: [
      {
        value: 'damaged',
        label: 'Reclassified as damaged',
      },
    ],
  },
  {
    value: 'remove_damaged',
    label: 'Remove damaged stock',
    reasons: [
      {
        value: 'disposed',
        label: 'Disposed',
      },
      {
        value: 'written_off',
        label: 'Written off',
      },
      {
        value: 'other',
        label: 'Other',
      },
    ],
  },
];

export interface StockAdjustmentInput {
  productId: number;
  action: AdjustmentAction;
  reason: AdjustmentReason;
  quantity: number;
  reference?: string;
  notes?: string;
}

// ==================================================
// LABELS
// ==================================================

export const STATUS_LABEL: Record<StockStatus, string> = {
  in_stock: 'In stock',
  low: 'Low stock',
  out: 'Out of stock',
};

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  opening: 'Opening',
  purchase_receipt: 'Purchase',
  sale_issue: 'Sale',
  sale_return: 'Sale return',
  purchase_return: 'Purchase return',
  adjustment_in: 'Adjust +',
  adjustment_out: 'Adjust −',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  reversal: 'Reversal',
};

// ==================================================
// API TYPES
// ==================================================

interface ApiStockRow {
  product_id: number;
  stock_no: string;
  product_name: string;
  brand: string;
  model: string;
  category: string;
  group: string;
  unit: string;
  purchase_price: string;
  sale_price: string;
  mrp: string;
  reorder_level: string;
  quantity: string;
  damaged_quantity: string;
  total_quantity: string;
  stock_status?: StockStatus;
  image: string | null;
}

interface ApiProduct {
  id: number;
  stock_no: string;
  name: string;
  brand: string;
  model: string;
  category: string;
  group: string;
  unit: string;
  purchase_price: string;
  sale_price: string;
  mrp: string;
  reorder_level: string;
  is_active: boolean;
}

interface ApiMovement {
  id: number;
  product_id: number;
  stock_no: string;
  product_name: string;
  stock_condition: StockCondition;
  movement_type: MovementType;
  quantity: string;
  balance_before: string;
  balance_after: string;
  reference: string;
  notes: string;
  created_by_name: string | null;
  created_at: string;
}

interface Page<T> {
  count: number;
  next: string | null;
  results: T[];
}

// ==================================================
// HELPERS
// ==================================================

const num = (
  value: string | number | null | undefined,
): number => Number(value ?? 0) || 0;

function stockFromApi(r: ApiStockRow): StockItem {
  const quantity = num(r.quantity);
  const reorderLevel = num(r.reorder_level);

  const status =
    r.stock_status ??
    (quantity <= 0
      ? 'out'
      : reorderLevel > 0 && quantity <= reorderLevel
        ? 'low'
        : 'in_stock');

  return {
    productId: r.product_id,
    stockNo: r.stock_no ?? '',
    name: r.product_name ?? '',
    brand: r.brand ?? '',
    model: r.model ?? '',
    category: r.category ?? '',
    group: r.group ?? '',
    unit: r.unit ?? 'pcs',
    purchasePrice: num(r.purchase_price),
    salePrice: num(r.sale_price),
    mrp: num(r.mrp),
    reorderLevel,
    quantity,
    damagedQuantity: num(r.damaged_quantity),
    totalQuantity: num(r.total_quantity),
    status,
    image: r.image ?? null,
  };
}

function movementFromApi(m: ApiMovement): StockMovement {
  return {
    id: m.id,
    productId: m.product_id,
    stockNo: m.stock_no,
    productName: m.product_name,
    condition: m.stock_condition,
    type: m.movement_type,
    quantity: num(m.quantity),
    balanceBefore: num(m.balance_before),
    balanceAfter: num(m.balance_after),
    reference: m.reference,
    notes: m.notes,
    createdByName: m.created_by_name ?? '',
    createdAt: m.created_at,
  };
}

function productBody(input: ProductInput): Record<string, unknown> {
  const text = (v?: string) => (v ?? '').trim();
  const money = (v?: number) => String(v ?? 0);

  return {
    stock_no: input.stockNo.trim(),
    name: input.name.trim(),
    brand: text(input.brand),
    model: text(input.model),
    category: text(input.category),
    group: text(input.group),
    unit: text(input.unit) || 'pcs',
    purchase_price: money(input.purchasePrice),
    sale_price: money(input.salePrice),
    mrp: money(input.mrp),
    reorder_level: money(input.reorderLevel),
  };
}

// ==================================================
// PRODUCTS
// ==================================================

/** Every active product with this business's stock (zero stock included). */
export async function listStock(): Promise<StockItem[]> {
  const rows = await api<ApiStockRow[]>('/inventory/stock/');
  return rows.map(stockFromApi);
}

export async function createProduct(input: ProductInput): Promise<void> {
  await api('/inventory/products/', {
    method: 'POST',
    body: productBody(input),
  });
}

export async function updateProduct(
  productId: number,
  input: ProductInput,
): Promise<void> {
  await api(`/inventory/products/${productId}/`, {
    method: 'PATCH',
    body: productBody(input),
  });
}

/** The API hides a product instead of deleting it, so history stays intact. */
export async function deactivateProduct(productId: number): Promise<void> {
  await api<ApiProduct>(`/inventory/products/${productId}/`, {
    method: 'DELETE',
  });
}

// ==================================================
// STOCK MOVEMENTS
// ==================================================

export async function listMovements(
  page: number,
  filters: MovementFilters = {},
  pageSize = 25,
): Promise<MovementPage> {
  const q = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });

  if (filters.productId) {
    q.set('product_id', String(filters.productId));
  }

  if (filters.type) {
    q.set('movement_type', filters.type);
  }

  if (filters.search) {
    q.set('search', filters.search);
  }

  if (filters.dateFrom) {
    q.set('date_from', filters.dateFrom);
  }

  if (filters.dateTo) {
    q.set('date_to', filters.dateTo);
  }

  const data = await api<Page<ApiMovement>>(
    `/inventory/stock/movements/?${q.toString()}`,
  );

  return {
    count: data.count,
    hasNext: Boolean(data.next),
    results: data.results.map(movementFromApi),
  };
}

// ==================================================
// LEGACY / GENERAL MOVEMENT INPUT
// ==================================================

export interface MovementInput {
  productId: number;
  type: MovementType;
  condition: StockCondition;

  /** Always positive; the type decides whether it adds or removes. */
  quantity: number;

  reference?: string;
  notes?: string;
}

/**
 * General stock movement API.
 *
 * Kept for existing purchase, sale and other movement integrations.
 */
export async function addMovement(
  input: MovementInput,
): Promise<StockMovement> {
  const data = await api<ApiMovement>('/inventory/stock/movements/', {
    method: 'POST',
    body: {
      product_id: input.productId,
      movement_type: input.type,
      stock_condition: input.condition,
      quantity: input.quantity.toFixed(3),
      reference: (input.reference ?? '').trim(),
      notes: (input.notes ?? '').trim(),
    },
  });

  return movementFromApi(data);
}

// ==================================================
// MANUAL STOCK ADJUSTMENT
// ==================================================

/**
 * Creates a manual stock adjustment.
 *
 * mark_damaged is represented as a decrease action with reason "damaged".
 * The backend creates both immutable movement records for reclassification.
 */
export async function addStockAdjustment(
  input: StockAdjustmentInput,
): Promise<StockMovement> {
  const data = await api<ApiMovement>('/inventory/stock/movements/', {
    method: 'POST',
    body: {
      product_id: input.productId,
      movement_type:
        input.action === 'increase'
          ? 'adjustment_in'
          : 'adjustment_out',
      adjustment_action: input.action,
      adjustment_reason: input.reason,
      quantity: input.quantity.toFixed(3),
      reference: (input.reference ?? '').trim(),
      notes: (input.notes ?? '').trim(),
    },
  });

  return movementFromApi(data);
}

// ==================================================
// INVENTORY SUMMARY
// ==================================================

export function getInventorySummary(items: StockItem[]) {
  return {
    skuCount: items.length,
    units: items.reduce((sum, i) => sum + i.quantity, 0),
    damagedUnits: items.reduce(
      (sum, i) => sum + i.damagedQuantity,
      0,
    ),
    stockValue: items.reduce(
      (sum, i) => sum + i.quantity * i.purchasePrice,
      0,
    ),
    lowCount: items.filter((i) => i.status === 'low').length,
    outCount: items.filter((i) => i.status === 'out').length,
  };
}

// ==================================================
// FORMATTING
// ==================================================

export function formatNpr(n: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
    maximumFractionDigits: 0,
  }).format(n);
}

/** 12 or 12.5, never 12.000. */
export function formatQty(n: number): string {
  return new Intl.NumberFormat('en-NP', {
    maximumFractionDigits: 3,
  }).format(n);
}
