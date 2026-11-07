/** Own profile, company and business details (Settings page). */

import { api, ApiError } from './api';
import { refreshProfile } from './auth';

export interface MyProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface BusinessInfo {
  id: number;
  name: string;
  code: string;
  type: string;
  address: string;
  phone: string;
  email: string;
}

interface ApiProfile {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}

interface ApiBusinessInfo {
  id: number;
  name: string;
  business_code: string;
  business_type: string;
  address: string;
  phone: string;
  email: string;
}

const toProfile = (u: ApiProfile): MyProfile => ({
  firstName: u.first_name ?? '',
  lastName: u.last_name ?? '',
  email: u.email ?? '',
  phone: u.phone ?? '',
});

const toBusiness = (b: ApiBusinessInfo): BusinessInfo => ({
  id: b.id,
  name: b.name,
  code: b.business_code,
  type: b.business_type,
  address: b.address ?? '',
  phone: b.phone ?? '',
  email: b.email ?? '',
});

export async function getMyProfile(): Promise<MyProfile> {
  const data = await api<{ user: ApiProfile }>('/auth/me/');
  return toProfile(data.user);
}

/** Saves the profile and refreshes the stored session so names update everywhere. */
export async function saveMyProfile(input: MyProfile): Promise<MyProfile> {
  const data = await api<{ user: ApiProfile }>('/auth/me/', {
    method: 'PATCH',
    body: {
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
    },
  });
  await refreshProfile();
  return toProfile(data.user);
}

export async function getBusiness(id: number): Promise<BusinessInfo> {
  return toBusiness(await api<ApiBusinessInfo>(`/businesses/${id}/`));
}

/** Company name, for a company owner. Returns null for an independent business. */
export async function getCompanyName(): Promise<string | null> {
  try {
    return (await api<{ name: string }>('/company/')).name;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) return null;
    throw error;
  }
}
