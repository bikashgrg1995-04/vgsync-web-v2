/**
 * Demo authentication + branch context for VGSync frontend.
 * Replace with real Django API calls later.
 *
 * Roles:
 * - owner: system owner (HO) — all branches + staff assign anywhere
 * - branch_owner: owns one branch — staff assign for own branch only
 * - headoffice / branch_manager / staff: operational roles
 */

export type UserRole =
  | 'owner'
  | 'branch_owner'
  | 'headoffice'
  | 'branch_manager'
  | 'staff';

export interface Branch {
  code: string;
  name: string;
  city: string;
}

export interface DemoUser {
  id: string;
  branchCode: string;
  username: string;
  password: string;
  displayName: string;
  role: UserRole;
  roleLabel: string;
  branchName: string;
  mustChangePassword: boolean;
  active: boolean;
}

export interface AuthSession {
  userId: string;
  homeBranchCode: string;
  username: string;
  displayName: string;
  role: UserRole;
  roleLabel: string;
  homeBranchName: string;
  activeBranchCode: string;
  activeBranchName: string;
  mustChangePassword: boolean;
  loggedInAt: string;
}

export const BRANCHES: Branch[] = [
  { code: 'HO', name: 'Head Office', city: 'Kathmandu' },
  { code: 'BHP', name: 'Bharatpur Branch', city: 'Bharatpur' },
  { code: 'PKR', name: 'Pokhara Branch', city: 'Pokhara' },
  { code: 'BTL', name: 'Butwal Branch', city: 'Butwal' },
];

const SEED_USERS: DemoUser[] = [
  // System owner
  {
    id: 'u-owner',
    branchCode: 'HO',
    username: 'owner',
    password: 'owner123',
    displayName: 'Bikash Gurung',
    role: 'owner',
    roleLabel: 'Owner',
    branchName: 'Head Office',
    mustChangePassword: true,
    active: true,
  },
  // Branch owners
  {
    id: 'u-bhp-owner',
    branchCode: 'BHP',
    username: 'owner',
    password: 'owner123',
    displayName: 'Hari Poudel',
    role: 'branch_owner',
    roleLabel: 'Branch Owner',
    branchName: 'Bharatpur Branch',
    mustChangePassword: true,
    active: true,
  },
  {
    id: 'u-pkr-owner',
    branchCode: 'PKR',
    username: 'owner',
    password: 'owner123',
    displayName: 'Gita Sharma',
    role: 'branch_owner',
    roleLabel: 'Branch Owner',
    branchName: 'Pokhara Branch',
    mustChangePassword: true,
    active: true,
  },
  {
    id: 'u-btl-owner',
    branchCode: 'BTL',
    username: 'owner',
    password: 'owner123',
    displayName: 'Nabin Karki',
    role: 'branch_owner',
    roleLabel: 'Branch Owner',
    branchName: 'Butwal Branch',
    mustChangePassword: true,
    active: true,
  },
  // HO admin
  {
    id: 'u-admin',
    branchCode: 'HO',
    username: 'admin',
    password: 'admin123',
    displayName: 'System Admin',
    role: 'headoffice',
    roleLabel: 'Admin',
    branchName: 'Head Office',
    mustChangePassword: false,
    active: true,
  },
  // Sample manager/staff
  {
    id: 'u-bhp-mgr',
    branchCode: 'BHP',
    username: 'manager',
    password: 'manager123',
    displayName: 'Sujan Shrestha',
    role: 'branch_manager',
    roleLabel: 'Manager',
    branchName: 'Bharatpur Branch',
    mustChangePassword: false,
    active: true,
  },
  {
    id: 'u-bhp-staff',
    branchCode: 'BHP',
    username: 'staff',
    password: 'staff123',
    displayName: 'Anita Thapa',
    role: 'staff',
    roleLabel: 'Staff',
    branchName: 'Bharatpur Branch',
    mustChangePassword: true,
    active: true,
  },
];

const SESSION_KEY = 'vgsync-session';
const USERS_KEY = 'vgsync-demo-users';

function loadUsers(): DemoUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) return JSON.parse(raw) as DemoUser[];
  } catch {
    // fall through
  }
  return structuredClone(SEED_USERS);
}

function saveUsers(users: DemoUser[]): void {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch {
    // ignore
  }
}

export function ensureUsersInitialized(): DemoUser[] {
  const existing = loadUsers();
  const ids = new Set(existing.map((u) => u.id));
  let changed = false;
  for (const seed of SEED_USERS) {
    if (!ids.has(seed.id)) {
      existing.push(structuredClone(seed));
      changed = true;
    }
  }
  if (changed || !localStorage.getItem(USERS_KEY)) {
    saveUsers(existing);
  }
  return existing;
}

export function getAllUsers(): DemoUser[] {
  return ensureUsersInitialized();
}

export function getBranchByCode(code: string): Branch | undefined {
  return BRANCHES.find((b) => b.code.toUpperCase() === code.trim().toUpperCase());
}

export function findDemoUser(
  branchCode: string,
  username: string,
  password: string,
): DemoUser | null {
  const users = ensureUsersInitialized();
  const normalizedBranch = branchCode.trim().toUpperCase();
  const normalizedUser = username.trim().toLowerCase();

  return (
    users.find(
      (u) =>
        u.active &&
        u.branchCode.toUpperCase() === normalizedBranch &&
        u.username.toLowerCase() === normalizedUser &&
        u.password === password,
    ) ?? null
  );
}

export function saveSession(user: DemoUser): AuthSession {
  const session: AuthSession = {
    userId: user.id,
    homeBranchCode: user.branchCode,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    roleLabel: user.roleLabel,
    homeBranchName: user.branchName,
    activeBranchCode: user.branchCode,
    activeBranchName: user.branchName,
    mustChangePassword: user.mustChangePassword,
    loggedInAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }

  return session;
}

export function getSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function updateSession(partial: Partial<AuthSession>): AuthSession | null {
  const session = getSession();
  if (!session) return null;
  const updated = { ...session, ...partial };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

export function isAuthenticated(): boolean {
  return getSession() !== null;
}

/** HO owner + HO admin can switch branches */
export function canSwitchBranch(session: AuthSession | null): boolean {
  return session?.role === 'owner' || session?.role === 'headoffice';
}

/** System owner, HO admin, or branch owner can manage staff */
export function canManageStaff(session: AuthSession | null): boolean {
  return (
    session?.role === 'owner' ||
    session?.role === 'headoffice' ||
    session?.role === 'branch_owner'
  );
}

export function switchActiveBranch(branchCode: string): AuthSession | null {
  const session = getSession();
  if (!session || !canSwitchBranch(session)) return null;

  const branch = getBranchByCode(branchCode);
  if (!branch) return null;

  return updateSession({
    activeBranchCode: branch.code,
    activeBranchName: branch.name,
  });
}

export function getAccessibleBranches(session: AuthSession | null): Branch[] {
  if (!session) return [];
  if (session.role === 'owner' || session.role === 'headoffice') return BRANCHES;
  const own = getBranchByCode(session.homeBranchCode);
  return own ? [own] : [];
}

/** Branches available when assigning staff */
export function getAssignableBranches(session: AuthSession | null): Branch[] {
  if (!session) return [];
  if (session.role === 'owner' || session.role === 'headoffice') {
    return BRANCHES.filter((b) => b.code !== 'HO');
  }
  if (session.role === 'branch_owner') {
    const own = getBranchByCode(session.homeBranchCode);
    return own ? [own] : [];
  }
  return [];
}

export function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): { ok: true } | { ok: false; error: string } {
  if (newPassword.length < 6) {
    return { ok: false, error: 'New password must be at least 6 characters.' };
  }

  const users = ensureUsersInitialized();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx < 0) return { ok: false, error: 'User not found.' };

  if (users[idx].password !== currentPassword) {
    return { ok: false, error: 'Current password is incorrect.' };
  }

  users[idx] = {
    ...users[idx],
    password: newPassword,
    mustChangePassword: false,
  };
  saveUsers(users);
  updateSession({ mustChangePassword: false });
  return { ok: true };
}

export interface StaffInput {
  displayName: string;
  username: string;
  branchCode: string;
  role: 'branch_manager' | 'staff';
  temporaryPassword: string;
}

export function assignStaff(
  input: StaffInput,
): { ok: true; user: DemoUser } | { ok: false; error: string } {
  const session = getSession();
  if (!canManageStaff(session) || !session) {
    return { ok: false, error: 'You cannot assign staff.' };
  }

  const branch = getBranchByCode(input.branchCode);
  if (!branch) return { ok: false, error: 'Invalid branch.' };

  // Branch owner locked to own branch
  if (
    session.role === 'branch_owner' &&
    branch.code.toUpperCase() !== session.homeBranchCode.toUpperCase()
  ) {
    return { ok: false, error: 'You can only assign staff to your own branch.' };
  }

  const username = input.username.trim().toLowerCase();
  if (!username) return { ok: false, error: 'Username is required.' };
  if (!input.displayName.trim()) return { ok: false, error: 'Name is required.' };
  if (input.temporaryPassword.length < 6) {
    return { ok: false, error: 'Temporary password must be at least 6 characters.' };
  }

  const users = ensureUsersInitialized();
  const exists = users.some(
    (u) =>
      u.branchCode.toUpperCase() === branch.code &&
      u.username.toLowerCase() === username,
  );
  if (exists) {
    return { ok: false, error: 'Username already exists in this branch.' };
  }

  const user: DemoUser = {
    id: `u-${Date.now()}`,
    branchCode: branch.code,
    username,
    password: input.temporaryPassword,
    displayName: input.displayName.trim(),
    role: input.role,
    roleLabel: input.role === 'branch_manager' ? 'Manager' : 'Staff',
    branchName: branch.name,
    mustChangePassword: true,
    active: true,
  };

  users.push(user);
  saveUsers(users);
  return { ok: true, user };
}

export function deactivateStaff(userId: string): boolean {
  const session = getSession();
  if (!canManageStaff(session) || !session) return false;

  const users = ensureUsersInitialized();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx < 0) return false;

  const target = users[idx];
  if (target.role === 'owner' || target.role === 'branch_owner') return false;

  if (
    session.role === 'branch_owner' &&
    target.branchCode.toUpperCase() !== session.homeBranchCode.toUpperCase()
  ) {
    return false;
  }

  users[idx] = { ...target, active: false };
  saveUsers(users);
  return true;
}

/** Staff list visible to current manager role */
export function listStaffForManagement(): DemoUser[] {
  const session = getSession();
  if (!session || !canManageStaff(session)) return [];

  const users = ensureUsersInitialized().filter(
    (u) => u.role !== 'owner' && u.role !== 'branch_owner',
  );

  if (session.role === 'branch_owner') {
    return users.filter(
      (u) => u.branchCode.toUpperCase() === session.homeBranchCode.toUpperCase(),
    );
  }

  return users;
}
