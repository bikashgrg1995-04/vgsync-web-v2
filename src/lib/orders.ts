/**
 * Stock orders (Branch -> Head Office), from the API (/api/v1/inventory/transfers/).
 *
 * A Branch orders; Head Office checks and dispatches good stock; the Branch
 * checks what arrived (good and damaged apart) and may send damaged stock back
 * with a note; Head Office receives that and reviews it. An order changes no
 * stock until goods move.
 */

import { api } from './api';

export type OrderStatus =
  | 'ordered'
  | 'partially_dispatched'
  | 'dispatched'
  | 'partially_received'
  | 'received'
  | 'cancelled';

export interface OrderSummary {
  id: number;
  reference: string;
  status: OrderStatus;
  branchId: number;
  branchName: string;
  headOfficeName: string;
  notes: string;
  createdByName: string;
  createdAt: string;
  ordered: number;
  dispatched: number;
  receivedGood: number;
  receivedDamaged: number;
  damagedToReturn: number;
}

export interface OrderItem {
  id: number;
  productId: number;
  stockNo: string;
  productName: string;
  unit: string;
  ordered: number;
  dispatched: number;
  toDispatch: number;
  receivedGood: number;
  receivedDamaged: number;
  toReceive: number;
  returned: number;
  damagedToReturn: number;
}

export interface OrderDispatch {
  id: number;
  reference: string;
  notes: string;
  by: string;
  at: string;
  items: { productName: string; quantity: number }[];
}

export interface OrderReceipt {
  id: number;
  reference: string;
  notes: string;
  by: string;
  at: string;
  items: { productName: string; goodQuantity: number; damagedQuantity: number }[];
}

export interface OrderReturn {
  id: number;
  reference: string;
  notes: string;
  by: string;
  at: string;
  items: { id: number; productName: string; quantity: number }[];
  receipt: null | {
    id: number;
    by: string;
    at: string;
    notes: string;
    items: { id: number; returnItem: number; productName: string; receivedQuantity: number }[];
  };
  review: null | {
    decision: 'accepted' | 'partially_accepted' | 'rejected';
    remarks: string;
    by: string;
    at: string;
    items: { productName: string; acceptedQuantity: number; rejectedQuantity: number; remarks: string }[];
  };
}

export interface Order extends OrderSummary {
  items: OrderItem[];
  dispatches: OrderDispatch[];
  receipts: OrderReceipt[];
  returns: OrderReturn[];
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  ordered: 'Ordered',
  partially_dispatched: 'Part dispatched',
  dispatched: 'In transit',
  partially_received: 'Part received',
  received: 'Delivered',
  cancelled: 'Cancelled',
};

export const DECISION_LABEL = {
  accepted: 'Accepted',
  partially_accepted: 'Partly accepted',
  rejected: 'Rejected',
} as const;

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const num = (v: string | number | null | undefined): number => Number(v ?? 0) || 0;

function summaryFromApi(r: Raw): OrderSummary {
  return {
    id: r.id,
    reference: r.reference,
    status: r.status,
    branchId: r.branch,
    branchName: r.branch_name,
    headOfficeName: r.head_office_name,
    notes: r.notes,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    ordered: num(r.ordered),
    dispatched: num(r.dispatched),
    receivedGood: num(r.received_good),
    receivedDamaged: num(r.received_damaged),
    damagedToReturn: num(r.damaged_to_return),
  };
}

function orderFromApi(r: Raw): Order {
  return {
    ...summaryFromApi(r),
    items: (r.items as Raw[]).map((i) => ({
      id: i.id,
      productId: i.product,
      stockNo: i.stock_no,
      productName: i.product_name,
      unit: i.unit,
      ordered: num(i.ordered),
      dispatched: num(i.dispatched),
      toDispatch: num(i.to_dispatch),
      receivedGood: num(i.received_good),
      receivedDamaged: num(i.received_damaged),
      toReceive: num(i.to_receive),
      returned: num(i.returned),
      damagedToReturn: num(i.damaged_to_return),
    })),
    dispatches: (r.dispatches as Raw[]).map((d) => ({
      id: d.id,
      reference: d.reference,
      notes: d.notes,
      by: d.by,
      at: d.at,
      items: (d.items as Raw[]).map((i) => ({ productName: i.product_name, quantity: num(i.quantity) })),
    })),
    receipts: (r.receipts as Raw[]).map((x) => ({
      id: x.id,
      reference: x.reference,
      notes: x.notes,
      by: x.by,
      at: x.at,
      items: (x.items as Raw[]).map((i) => ({
        productName: i.product_name,
        goodQuantity: num(i.good_quantity),
        damagedQuantity: num(i.damaged_quantity),
      })),
    })),
    returns: (r.returns as Raw[]).map((b) => ({
      id: b.id,
      reference: b.reference,
      notes: b.notes,
      by: b.by,
      at: b.at,
      items: (b.items as Raw[]).map((i) => ({ id: i.id, productName: i.product_name, quantity: num(i.quantity) })),
      receipt: b.receipt
        ? {
            id: b.receipt.id,
            by: b.receipt.by,
            at: b.receipt.at,
            notes: b.receipt.notes,
            items: (b.receipt.items as Raw[]).map((i) => ({
              id: i.id,
              returnItem: i.return_item,
              productName: i.product_name,
              receivedQuantity: num(i.received_quantity),
            })),
          }
        : null,
      review: b.review
        ? {
            decision: b.review.decision,
            remarks: b.review.remarks,
            by: b.review.by,
            at: b.review.at,
            items: (b.review.items as Raw[]).map((i) => ({
              productName: i.product_name,
              acceptedQuantity: num(i.accepted_quantity),
              rejectedQuantity: num(i.rejected_quantity),
              remarks: i.remarks,
            })),
          }
        : null,
    })),
  };
}

const qty = (n: number) => n.toFixed(3);

export async function listOrders(status: OrderStatus | '' = '', search = ''): Promise<OrderSummary[]> {
  const out: OrderSummary[] = [];
  const q = new URLSearchParams({ page_size: '100' });
  if (status) q.set('status', status);
  if (search) q.set('search', search);

  for (let page = 1; ; page += 1) {
    q.set('page', String(page));
    const data = await api<{ results: Raw[]; next: string | null }>(`/inventory/transfers/?${q.toString()}`);
    out.push(...data.results.map(summaryFromApi));
    if (!data.next) break;
  }
  return out;
}

export async function getOrder(id: number): Promise<Order> {
  return orderFromApi(await api<Raw>(`/inventory/transfers/${id}/`));
}

export async function createOrder(lines: { productId: number; quantity: number }[], notes = ''): Promise<Order> {
  return orderFromApi(
    await api<Raw>('/inventory/transfers/', {
      method: 'POST',
      body: { items: lines.map((l) => ({ product: l.productId, quantity: qty(l.quantity) })), notes: notes.trim() },
    }),
  );
}

export async function cancelOrder(id: number, reason: string): Promise<Order> {
  return orderFromApi(await api<Raw>(`/inventory/transfers/${id}/cancel/`, { method: 'POST', body: { reason } }));
}

export async function dispatchOrder(id: number, lines: { itemId: number; quantity: number }[], notes = ''): Promise<Order> {
  return orderFromApi(
    await api<Raw>(`/inventory/transfers/${id}/dispatch/`, {
      method: 'POST',
      body: { items: lines.map((l) => ({ transfer_item: l.itemId, quantity: qty(l.quantity) })), notes: notes.trim() },
    }),
  );
}

export async function receiveOrder(
  id: number,
  lines: { itemId: number; good: number; damaged: number }[],
  notes = '',
): Promise<Order> {
  return orderFromApi(
    await api<Raw>(`/inventory/transfers/${id}/receive/`, {
      method: 'POST',
      body: {
        items: lines.map((l) => ({ transfer_item: l.itemId, good_quantity: qty(l.good), damaged_quantity: qty(l.damaged) })),
        notes: notes.trim(),
      },
    }),
  );
}

export async function returnDamaged(id: number, lines: { itemId: number; quantity: number }[], note: string): Promise<Order> {
  return orderFromApi(
    await api<Raw>(`/inventory/transfers/${id}/return/`, {
      method: 'POST',
      body: { items: lines.map((l) => ({ transfer_item: l.itemId, quantity: qty(l.quantity) })), notes: note.trim() },
    }),
  );
}

export async function receiveReturn(
  id: number,
  batchId: number,
  lines: { returnItemId: number; quantity: number }[],
  notes = '',
): Promise<Order> {
  return orderFromApi(
    await api<Raw>(`/inventory/transfers/${id}/returns/${batchId}/receive/`, {
      method: 'POST',
      body: { items: lines.map((l) => ({ return_item: l.returnItemId, received_quantity: qty(l.quantity) })), notes: notes.trim() },
    }),
  );
}

export async function reviewReturn(
  id: number,
  batchId: number,
  lines: { receiptItemId: number; accepted: number; rejected: number }[],
  remarks: string,
): Promise<Order> {
  return orderFromApi(
    await api<Raw>(`/inventory/transfers/${id}/returns/${batchId}/review/`, {
      method: 'POST',
      body: {
        items: lines.map((l) => ({ receipt_item: l.receiptItemId, accepted_quantity: qty(l.accepted), rejected_quantity: qty(l.rejected) })),
        remarks: remarks.trim(),
      },
    }),
  );
}

export function formatQty(n: number): string {
  return new Intl.NumberFormat('en-NP', { maximumFractionDigits: 3 }).format(n);
}
