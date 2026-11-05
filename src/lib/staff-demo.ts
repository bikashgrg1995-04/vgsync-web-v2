/**
 * Demo staff list for the Staff page. NOT connected to the API yet: it is
 * stored in this browser only and has nothing to do with real logins.
 * Replace with the backend Team API (/api/v1/staff/) when that screen is wired.
 */

import { canManageStaff, getSession, type AuthSession } from './auth';

export interface DemoBranch {
  code: string;
  name: string;
}

export interface DemoStaff {
  id: string;
  branchCode: string;
  username: string;
  displayName: string;
  role: 'branch_manager' | 'staff';
  roleLabel: string;
  mustChangePassword: boolean;
  active: boolean;
}

export interface StaffInput {
  displayName: string;
  username: string;
  branchCode: string;
  role: 'branch_manager' | 'staff';
  temporaryPassword: string;
}

const STAFF_KEY = 'vgsync-demo-staff';

const DEMO_BRANCHES: DemoBranch[] = [
  { code: 'BHP', name: 'Bharatpur Branch' },
  { code: 'PKR', name: 'Pokhara Branch' },
  { code: 'BTL', name: 'Butwal Branch' },
];

function load(): DemoStaff[] {
  try {
    const raw = localStorage.getItem(STAFF_KEY);
    if (raw) return JSON.parse(raw) as DemoStaff[];
  } catch {
    // fall through
  }
  return [];
}

function save(list: DemoStaff[]): void {
  try {
    localStorage.setItem(STAFF_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function getAssignableBranches(session: AuthSession | null): DemoBranch[] {
  if (!session || !canManageStaff(session)) return [];
  if (session.role === 'owner' || session.role === 'headoffice') return DEMO_BRANCHES;
  return [{ code: session.activeBranchCode, name: session.activeBranchName }];
}

export function assignStaff(
  input: StaffInput,
): { ok: true; user: DemoStaff } | { ok: false; error: string } {
  const session = getSession();
  if (!session || !canManageStaff(session)) return { ok: false, error: 'You cannot assign staff.' };

  const branch = getAssignableBranches(session).find(
    (b) => b.code.toUpperCase() === input.branchCode.trim().toUpperCase(),
  );
  if (!branch) return { ok: false, error: 'Invalid branch.' };

  const username = input.username.trim().toLowerCase();
  if (!username) return { ok: false, error: 'Username is required.' };
  if (!input.displayName.trim()) return { ok: false, error: 'Name is required.' };
  if (input.temporaryPassword.length < 6) {
    return { ok: false, error: 'Temporary password must be at least 6 characters.' };
  }

  const list = load();
  if (list.some((u) => u.branchCode === branch.code && u.username === username)) {
    return { ok: false, error: 'Username already exists in this branch.' };
  }

  const user: DemoStaff = {
    id: `s-${Date.now()}`,
    branchCode: branch.code,
    username,
    displayName: input.displayName.trim(),
    role: input.role,
    roleLabel: input.role === 'branch_manager' ? 'Manager' : 'Staff',
    mustChangePassword: true,
    active: true,
  };

  list.push(user);
  save(list);
  return { ok: true, user };
}

export function listStaffForManagement(): DemoStaff[] {
  const session = getSession();
  if (!session || !canManageStaff(session)) return [];
  const list = load();
  if (session.role === 'branch_owner') {
    return list.filter((u) => u.branchCode === session.activeBranchCode);
  }
  return list;
}
