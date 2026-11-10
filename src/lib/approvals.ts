/**
 * Approval requests and the owner's approval rules
 * (/api/v1/approvals/ and /api/v1/approvals/rules/).
 *
 * A large purchase, expense or stock adjustment is held by the API until
 * someone with the matching approve permission decides. The person who asked
 * then repeats the same request with `approval_id`.
 */

import { api } from './api';

export type ApprovalKind = 'purchase' | 'expense' | 'stock_adjustment' | 'stock_write_off';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export const KIND_LABEL: Record<ApprovalKind, string> = {
  purchase: 'High-value purchase',
  expense: 'High-value expense',
  stock_adjustment: 'Large stock adjustment',
  stock_write_off: 'Stock write-off',
};

export interface ApprovalRequest {
  id: number;
  kind: ApprovalKind;
  kindLabel: string;
  status: ApprovalStatus;
  amount: number;
  summary: string;
  createdByName: string;
  decidedByName: string | null;
  rejectionReason: string;
  createdAt: string;
  decidedAt: string | null;
  usedAt: string | null;
}

export interface ApprovalRule {
  id: number | null;
  kind: ApprovalKind;
  threshold: number;
  isActive: boolean;
  allowSelfApproval: boolean;
}

interface ApiRequest {
  id: number;
  kind: ApprovalKind;
  kind_label: string;
  status: ApprovalStatus;
  amount: string;
  summary: string;
  created_by_name: string;
  decided_by_name: string | null;
  rejection_reason: string;
  created_at: string;
  decided_at: string | null;
  used_at: string | null;
}

interface ApiRule {
  id: number;
  kind: ApprovalKind;
  threshold: string;
  is_active: boolean;
  allow_self_approval: boolean;
}

interface Page<T> {
  results: T[];
  next: string | null;
}

async function all<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  for (;;) {
    const sep = path.includes('?') ? '&' : '?';
    const data = await api<Page<T>>(`${path}${sep}page=${page}&page_size=100`);
    out.push(...data.results);
    if (!data.next) break;
    page += 1;
  }
  return out;
}

function requestFromApi(r: ApiRequest): ApprovalRequest {
  return {
    id: r.id,
    kind: r.kind,
    kindLabel: r.kind_label,
    status: r.status,
    amount: Number(r.amount),
    summary: r.summary,
    createdByName: r.created_by_name,
    decidedByName: r.decided_by_name,
    rejectionReason: r.rejection_reason,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    usedAt: r.used_at,
  };
}

function ruleFromApi(r: ApiRule): ApprovalRule {
  return {
    id: r.id,
    kind: r.kind,
    threshold: Number(r.threshold),
    isActive: r.is_active,
    allowSelfApproval: r.allow_self_approval,
  };
}

export async function listApprovals(): Promise<ApprovalRequest[]> {
  return (await all<ApiRequest>('/approvals/')).map(requestFromApi);
}

export async function approve(id: number): Promise<ApprovalRequest> {
  return requestFromApi(await api<ApiRequest>(`/approvals/${id}/approve/`, { method: 'POST', body: {} }));
}

export async function reject(id: number, reason: string): Promise<ApprovalRequest> {
  return requestFromApi(
    await api<ApiRequest>(`/approvals/${id}/reject/`, { method: 'POST', body: { reason } }),
  );
}

/** Every kind, with the owner's rule when one is set (none means no approval). */
export async function listRules(): Promise<ApprovalRule[]> {
  const rules = (await all<ApiRule>('/approvals/rules/')).map(ruleFromApi);
  return (Object.keys(KIND_LABEL) as ApprovalKind[]).map(
    (kind) =>
      rules.find((r) => r.kind === kind) ?? {
        id: null,
        kind,
        threshold: 0,
        isActive: false,
        allowSelfApproval: false,
      },
  );
}

/** Creates or updates the rule for one kind (the API keeps one rule per kind). */
export async function saveRule(rule: ApprovalRule): Promise<ApprovalRule> {
  return ruleFromApi(
    await api<ApiRule>('/approvals/rules/', {
      method: 'POST',
      body: {
        kind: rule.kind,
        threshold: rule.threshold.toFixed(2),
        is_active: rule.isActive,
        allow_self_approval: rule.allowSelfApproval,
      },
    }),
  );
}
