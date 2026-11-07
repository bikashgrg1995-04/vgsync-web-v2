/** Head Office and Branch management (company owner). */

import { api, ApiError } from './api';

export type BusinessKind = 'head_office' | 'branch' | 'independent';

export interface BusinessRow {
  id: number;
  name: string;
  code: string;
  type: BusinessKind;
  parentName: string | null;
  address: string;
  phone: string;
  email: string;
  isActive: boolean;
  createdAt: string;
}

export interface BusinessInput {
  name: string;
  code?: string;
  address: string;
  phone: string;
  email: string;
}

interface ApiRow {
  id: number;
  name: string;
  business_code: string;
  business_type: BusinessKind;
  parent_business_name: string | null;
  address: string;
  phone: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

const toRow = (b: ApiRow): BusinessRow => ({
  id: b.id,
  name: b.name,
  code: b.business_code,
  type: b.business_type,
  parentName: b.parent_business_name,
  address: b.address ?? '',
  phone: b.phone ?? '',
  email: b.email ?? '',
  isActive: b.is_active,
  createdAt: b.created_at,
});

export const TYPE_LABEL: Record<BusinessKind, string> = {
  head_office: 'Head Office',
  branch: 'Branch',
  independent: 'Independent',
};

async function all(): Promise<BusinessRow[]> {
  const rows: BusinessRow[] = [];
  for (let page = 1; page < 50; page += 1) {
    const data = await api<{ results: ApiRow[]; next: string | null }>(`/businesses/?page=${page}&page_size=100`);
    rows.push(...data.results.map(toRow));
    if (!data.next) break;
  }
  return rows;
}

export const listBusinesses = all;

export async function createBranch(input: BusinessInput): Promise<BusinessRow> {
  return toRow(
    await api<ApiRow>('/businesses/', {
      method: 'POST',
      body: {
        name: input.name.trim(),
        business_code: (input.code ?? '').trim(),
        address: input.address.trim(),
        phone: input.phone.trim(),
        email: input.email.trim(),
      },
    }),
  );
}

export async function updateBusiness(id: number, input: BusinessInput): Promise<BusinessRow> {
  return toRow(
    await api<ApiRow>(`/businesses/${id}/`, {
      method: 'PATCH',
      body: {
        name: input.name.trim(),
        address: input.address.trim(),
        phone: input.phone.trim(),
        email: input.email.trim(),
      },
    }),
  );
}

export async function setBranchActive(id: number, active: boolean): Promise<BusinessRow> {
  return toRow(await api<ApiRow>(`/businesses/${id}/${active ? 'activate' : 'deactivate'}/`, { method: 'POST' }));
}

export { ApiError };
