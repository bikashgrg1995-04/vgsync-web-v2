/**
 * Where the signed-in session lives in the browser.
 *
 * "Remember me" ticked   -> localStorage   (survives closing the browser)
 * "Remember me" unticked -> sessionStorage (gone when the tab/browser closes)
 *
 * Only one of the two ever holds a session. The API tokens are kept here,
 * so anything that can run script on this origin can read them: never add
 * third-party scripts to these pages.
 */

export interface ApiUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  role: 'owner' | 'admin' | 'accountant' | 'staff';
  scope: 'company' | 'business' | 'platform' | null;
  company_name: string | null;
  business_name: string | null;
  position_name: string | null;
  must_change_password: boolean;
  /** What a staff member's position allows (empty for other roles). */
  permissions?: Array<{
    module: string;
    can_view: boolean;
    can_create: boolean;
    can_update: boolean;
    can_delete: boolean;
  }>;
  /** Owner, or staff whose position grants the staff module ("Administration"). */
  can_manage_team?: boolean;
  /** Every `module.action` code the person holds right now (e.g. `sales.cancel`). */
  effective_permissions?: string[];
}

export interface ApiBusiness {
  id: number;
  name: string;
  business_code: string;
  business_type: 'head_office' | 'branch' | 'independent' | string;
  company_id: number | null;
  company_name: string | null;
  access_mode: 'full' | 'read_only';
}

export interface StoredAuth {
  access: string;
  refresh: string;
  user: ApiUser;
  active_business: ApiBusiness;
  /** The business the user signed in with (used to switch back to it). */
  home_business: ApiBusiness;
  remember: boolean;
  logged_in_at: string;
}

const AUTH_KEY = 'vgsync-auth';
const REMEMBERED_KEY = 'vgsync-remembered';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function parse(raw: string | null): StoredAuth | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as StoredAuth;
    return data?.access && data?.refresh && data?.user ? data : null;
  } catch {
    return null;
  }
}

export function readAuth(): StoredAuth | null {
  return (
    safe(() => parse(sessionStorage.getItem(AUTH_KEY)), null) ??
    safe(() => parse(localStorage.getItem(AUTH_KEY)), null)
  );
}

/** Save the session. `remember` picks the storage; omit it to keep the current one. */
export function writeAuth(auth: StoredAuth): void {
  const target = auth.remember ? localStorage : sessionStorage;
  const other = auth.remember ? sessionStorage : localStorage;
  safe(() => other.removeItem(AUTH_KEY), undefined);
  safe(() => target.setItem(AUTH_KEY, JSON.stringify(auth)), undefined);
}

export function clearAuth(): void {
  safe(() => sessionStorage.removeItem(AUTH_KEY), undefined);
  safe(() => localStorage.removeItem(AUTH_KEY), undefined);
}

export const AUTH_STORAGE_KEY = AUTH_KEY;

/** Business code + username shown again on the login form after "Remember me". */
export interface RememberedLogin {
  businessCode: string;
  username: string;
}

export function readRemembered(): RememberedLogin | null {
  return safe(() => {
    const raw = localStorage.getItem(REMEMBERED_KEY);
    return raw ? (JSON.parse(raw) as RememberedLogin) : null;
  }, null);
}

export function writeRemembered(value: RememberedLogin | null): void {
  safe(() => {
    if (value) localStorage.setItem(REMEMBERED_KEY, JSON.stringify(value));
    else localStorage.removeItem(REMEMBERED_KEY);
  }, undefined);
}
