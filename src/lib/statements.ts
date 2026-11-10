/**
 * Statement of a customer or a supplier: every transaction with them in date
 * order with a running balance (/customers/:id/statement/ and
 * /suppliers/:id/statement/). The server works the balance out from the
 * records, so it is never stale.
 */

import { api, apiDownload } from './api';

export type PartyKind = 'customer' | 'supplier';

export const STATEMENT_TYPES: Record<PartyKind, Record<string, string>> = {
  customer: {
    sale: 'Sale',
    payment: 'Payment',
    return: 'Return',
    refund: 'Refund',
    replacement: 'Replacement',
    adjustment: 'Credit adjustment',
  },
  supplier: {
    purchase: 'Purchase',
    payment: 'Payment',
    return: 'Return',
    refund: 'Refund',
    replacement: 'Replacement',
    adjustment: 'Credit adjustment',
  },
};

export interface StatementRow {
  date: string;
  type: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface Statement {
  party: { id: number; name: string };
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  balanceMeans: string;
  rows: StatementRow[];
  hasMore: boolean;
}

export interface StatementFilters {
  dateFrom?: string;
  dateTo?: string;
  type?: string;
}

const num = (value: string | number | null | undefined): number => Number(value ?? 0) || 0;

const base = (kind: PartyKind, id: number) =>
  `/${kind === 'customer' ? 'customers' : 'suppliers'}/${id}/statement/`;

function query(filters: StatementFilters, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  if (filters.type) params.set('type', filters.type);
  const text = params.toString();
  return text ? `?${text}` : '';
}

interface RawStatement {
  party: { id: number; name: string };
  opening_balance: string;
  total_debit: string;
  total_credit: string;
  closing_balance: string;
  balance_means: string;
  next: string | null;
  results: Array<{
    date: string;
    type: string;
    reference: string;
    description: string;
    debit: string;
    credit: string;
    balance: string;
  }>;
}

export async function getPartyStatement(
  kind: PartyKind,
  id: number,
  filters: StatementFilters = {},
  page = 1,
): Promise<Statement> {
  const data = await api<RawStatement>(`${base(kind, id)}${query(filters, { page: String(page) })}`);

  return {
    party: data.party,
    openingBalance: num(data.opening_balance),
    totalDebit: num(data.total_debit),
    totalCredit: num(data.total_credit),
    closingBalance: num(data.closing_balance),
    balanceMeans: data.balance_means,
    hasMore: !!data.next,
    rows: data.results.map((r) => ({
      date: r.date,
      type: r.type,
      reference: r.reference,
      description: r.description,
      debit: num(r.debit),
      credit: num(r.credit),
      balance: num(r.balance),
    })),
  };
}

/** Download every row (not one page) as Excel or PDF. */
export function downloadPartyStatement(
  kind: PartyKind,
  id: number,
  file: 'xlsx' | 'pdf',
  filters: StatementFilters = {},
): Promise<void> {
  return apiDownload(`${base(kind, id)}${query(filters, { export: file })}`, `${kind}-statement.${file}`);
}

/** Where the statement page for one party lives. */
export const statementUrl = (kind: PartyKind, id: number): string =>
  `/dashboard/statements/?kind=${kind}&id=${id}`;
