/**
 * Authentication for the VGSync frontend, talking to the Django API
 * (/api/v1/auth/*). The session is kept by ./session-store.
 */

import { api, ApiError } from './api';
import {
  clearAuth,
  readAuth,
  readRemembered,
  writeAuth,
  writeRemembered,
  type ApiBusiness,
  type ApiUser,
  type StoredAuth,
} from './session-store';

export { readRemembered };

/** Roles used by the menu. Derived from the API role and where the user works. */
export type UserRole =
  | 'owner'
  | 'branch_owner'
  | 'headoffice'
  | 'branch_manager'
  | 'staff';

export interface Branch {
  id: number;
  code: string;
  name: string;
  type: string;
}

export interface AuthSession {
  userId: string;
  username: string;
  displayName: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  /** Business the user signed in with. */
  homeBranchCode: string;
  homeBranchName: string;
  /** Business the user is working in right now. */
  activeBranchCode: string;
  activeBranchName: string;
  activeBusinessId: number;
  businessType: string;
  accessMode: 'full' | 'read_only';
  companyName: string | null;
  mustChangePassword: boolean;
  /** Every permission code the person holds (owners hold all). */
  permissions: string[];
  isOwner: boolean;
  remember: boolean;
  loggedInAt: string;
}

interface AuthResponse {
  access: string;
  refresh: string;
  user: ApiUser;
  active_business: ApiBusiness;
}

const ROLE_LABELS: Record<ApiUser['role'], string> = {
  owner: 'Owner',
  admin: 'Admin',
  accountant: 'Accountant',
  staff: 'Staff',
};

function toRole(user: ApiUser): UserRole {
  switch (user.role) {
    case 'owner':
      return user.scope === 'company' ? 'owner' : 'branch_owner';
    case 'admin':
      return 'headoffice';
    case 'accountant':
      return 'branch_manager';
    default:
      return 'staff';
  }
}

function toSession(auth: StoredAuth): AuthSession {
  const { user, active_business: active, home_business: home } = auth;
  const name = `${user.first_name} ${user.last_name}`.trim();

  return {
    userId: String(user.id),
    username: user.username,
    displayName: name || user.username,
    email: user.email,
    role: toRole(user),
    roleLabel: user.position_name || ROLE_LABELS[user.role] || user.role,
    homeBranchCode: home.business_code,
    homeBranchName: home.name,
    activeBranchCode: active.business_code,
    activeBranchName: active.name,
    activeBusinessId: active.id,
    businessType: active.business_type,
    accessMode: active.access_mode,
    companyName: active.company_name,
    mustChangePassword: user.must_change_password,
    permissions: user.effective_permissions ?? [],
    isOwner: user.role === 'owner',
    remember: auth.remember,
    loggedInAt: auth.logged_in_at,
  };
}

// ---------- session ----------

export function getSession(): AuthSession | null {
  const auth = readAuth();
  return auth ? toSession(auth) : null;
}

export function isAuthenticated(): boolean {
  return readAuth() !== null;
}

/** Re-read the user and active business from the server (catches revoked or changed accounts). */
export async function refreshProfile(): Promise<AuthSession | null> {
  const before = readAuth();
  if (!before) return null;

  const data = await api<{ user: ApiUser; active_business: ApiBusiness }>('/auth/me/');
  const current = readAuth();
  if (!current) return null;

  writeAuth({ ...current, user: data.user, active_business: data.active_business });
  return getSession();
}

// ---------- login / logout ----------

export interface LoginInput {
  businessCode: string;
  username: string;
  password: string;
  remember: boolean;
}

export async function login(input: LoginInput): Promise<AuthSession> {
  const data = await api<AuthResponse>('/auth/login/', {
    method: 'POST',
    auth: false,
    body: {
      business_code: input.businessCode.trim(),
      username: input.username.trim(),
      password: input.password,
    },
  });

  writeAuth({
    access: data.access,
    refresh: data.refresh,
    user: data.user,
    active_business: data.active_business,
    home_business: data.active_business,
    remember: input.remember,
    logged_in_at: new Date().toISOString(),
  });

  // "Remember me" also pre-fills the business code and username next time.
  writeRemembered(
    input.remember
      ? { businessCode: data.active_business.business_code, username: data.user.username }
      : null,
  );

  return getSession() as AuthSession;
}

/**
 * Revokes the refresh token on the server, then clears the browser session.
 * The browser session is cleared even when the server cannot be reached.
 */
export async function logout(): Promise<void> {
  const auth = readAuth();
  clearAuth();

  if (!auth) return;

  try {
    await api('/auth/logout/', { method: 'POST', auth: false, body: { refresh: auth.refresh } });
  } catch {
    // The token expires on its own; there is nothing more to do here.
  }
}

// ---------- passwords ----------

export async function forgotPassword(businessCode: string, username: string): Promise<string> {
  const data = await api<{ detail: string }>('/auth/forgot-password/', {
    method: 'POST',
    auth: false,
    body: { business_code: businessCode.trim(), username: username.trim() },
  });
  return data.detail;
}

export async function resetPassword(input: {
  uid: string;
  token: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<string> {
  const data = await api<{ detail: string }>('/auth/reset-password/', {
    method: 'POST',
    auth: false,
    body: {
      uid: input.uid,
      token: input.token,
      new_password: input.newPassword,
      confirm_password: input.confirmPassword,
    },
  });
  return data.detail;
}

/**
 * Changes the password. The server signs the user out everywhere, so the
 * browser session is cleared too and the user logs in again.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<void> {
  await api('/auth/change-password/', {
    method: 'POST',
    body: {
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword,
    },
  });
  clearAuth();
}

// ---------- roles and branches ----------

/** Company owner, admin or accountant can move between Head Office and branches. */
export function canSwitchBranch(session: AuthSession | null): boolean {
  const auth = readAuth();
  if (!session || !auth) return false;
  return auth.user.scope === 'company' && auth.user.role !== 'staff';
}

/**
 * The owner, and staff whose position grants the staff module (the
 * "Administration" position), can open the Staff page. The API enforces this
 * too; this only decides what is shown.
 */
export function canManageStaff(session: AuthSession | null): boolean {
  const auth = readAuth();
  if (!session || !auth) return false;
  return auth.user.can_manage_team === true;
}

/** Only the owner can create or change positions (others may read them). */
export function canEditPositions(session: AuthSession | null): boolean {
  const auth = readAuth();
  if (!session || !auth) return false;
  return auth.user.role === 'owner';
}

/** The owner, or staff holding `staff.manage_positions` (never above their own access). */
export function canManagePositions(session: AuthSession | null): boolean {
  return canEditPositions(session) || (!!session && session.permissions.includes('staff.manage_positions'));
}

/**
 * Whether the signed-in person holds a permission such as `sales.cancel`.
 * The API decides for real; this only decides what is shown. Owners hold all.
 */
export function can(session: AuthSession | null, code: string): boolean {
  if (!session) return false;
  return session.isOwner || session.permissions.includes(code);
}

/** Head Office (the business signed in with) plus every active branch. */
export async function loadBranches(): Promise<Branch[]> {
  const auth = readAuth();
  if (!auth || !canSwitchBranch(getSession())) return [];

  const home = auth.home_business;
  const list = await api<Array<{ id: number; name: string; business_code: string; business_type: string }>>(
    '/businesses/branches/',
  );

  const branches: Branch[] = list.map((b) => ({
    id: b.id,
    code: b.business_code,
    name: b.name,
    type: b.business_type,
  }));

  if (home.business_type === 'head_office' && !branches.some((b) => b.id === home.id)) {
    branches.unshift({ id: home.id, code: home.business_code, name: home.name, type: home.business_type });
  }

  return branches;
}

/** Switch the business the user works in. Issues new tokens for that business. */
export async function switchBranch(businessId: number): Promise<AuthSession> {
  const auth = readAuth();
  if (!auth) throw new ApiError('Please sign in.', 401);

  const data = await api<AuthResponse>('/auth/business-context/', {
    method: 'POST',
    body: { refresh: auth.refresh, business_id: businessId },
  });

  const current = readAuth() ?? auth;
  writeAuth({
    ...current,
    access: data.access,
    refresh: data.refresh,
    user: data.user,
    active_business: data.active_business,
  });

  return getSession() as AuthSession;
}

export { ApiError };
