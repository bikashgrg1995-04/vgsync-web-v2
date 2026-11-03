/**
 * Demo authentication + branch context for VGSync frontend.
 * Replace with real Django API calls later.
 *
 * Rules:
 * - Head Office (role: headoffice) can switch to any branch and view its data.
 * - Branch users (manager / staff) are locked to their own branch only.
 */

export type UserRole = 'headoffice' | 'branch_manager' | 'staff';

export interface Branch {
  code: string;
  name: string;
  city: string;
}

export interface DemoUser {
  branchCode: string; // home / assigned branch
  username: string;
  password: string;
  displayName: string;
  role: UserRole;
  roleLabel: string;
  branchName: string;
}

export interface AuthSession {
  /** User's home / login branch */
  homeBranchCode: string;
  username: string;
  displayName: string;
  role: UserRole;
  roleLabel: string;
  homeBranchName: string;
  /** Currently selected branch (HO can change this) */
  activeBranchCode: string;
  activeBranchName: string;
  loggedInAt: string;
}

/** All branches in the system (demo) */
export const BRANCHES: Branch[] = [
  { code: 'HO', name: 'Head Office', city: 'Kathmandu' },
  { code: 'BHP', name: 'Bharatpur Branch', city: 'Bharatpur' },
  { code: 'PKR', name: 'Pokhara Branch', city: 'Pokhara' },
  { code: 'BTL', name: 'Butwal Branch', city: 'Butwal' },
];

export const DEMO_USERS: DemoUser[] = [
  // Head Office
  {
    branchCode: 'HO',
    username: 'admin',
    password: 'admin123',
    displayName: 'Bikash Gurung',
    role: 'headoffice',
    roleLabel: 'Head Office Admin',
    branchName: 'Head Office',
  },
  // Bharatpur
  {
    branchCode: 'BHP',
    username: 'manager',
    password: 'manager123',
    displayName: 'Sujan Shrestha',
    role: 'branch_manager',
    roleLabel: 'Branch Manager',
    branchName: 'Bharatpur Branch',
  },
  {
    branchCode: 'BHP',
    username: 'staff',
    password: 'staff123',
    displayName: 'Anita Thapa',
    role: 'staff',
    roleLabel: 'Sales Staff',
    branchName: 'Bharatpur Branch',
  },
  // Pokhara
  {
    branchCode: 'PKR',
    username: 'manager',
    password: 'manager123',
    displayName: 'Ramesh Adhikari',
    role: 'branch_manager',
    roleLabel: 'Branch Manager',
    branchName: 'Pokhara Branch',
  },
  {
    branchCode: 'PKR',
    username: 'staff',
    password: 'staff123',
    displayName: 'Sunita Karki',
    role: 'staff',
    roleLabel: 'Sales Staff',
    branchName: 'Pokhara Branch',
  },
  // Butwal
  {
    branchCode: 'BTL',
    username: 'manager',
    password: 'manager123',
    displayName: 'Prakash Magar',
    role: 'branch_manager',
    roleLabel: 'Branch Manager',
    branchName: 'Butwal Branch',
  },
];

const SESSION_KEY = 'vgsync-session';

export function getBranchByCode(code: string): Branch | undefined {
  return BRANCHES.find((b) => b.code.toUpperCase() === code.trim().toUpperCase());
}

export function findDemoUser(
  branchCode: string,
  username: string,
  password: string,
): DemoUser | null {
  const normalizedBranch = branchCode.trim().toUpperCase();
  const normalizedUser = username.trim().toLowerCase();

  return (
    DEMO_USERS.find(
      (u) =>
        u.branchCode.toUpperCase() === normalizedBranch &&
        u.username.toLowerCase() === normalizedUser &&
        u.password === password,
    ) ?? null
  );
}

export function saveSession(user: DemoUser): AuthSession {
  const session: AuthSession = {
    homeBranchCode: user.branchCode,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    roleLabel: user.roleLabel,
    homeBranchName: user.branchName,
    // On login, active branch = home branch
    activeBranchCode: user.branchCode,
    activeBranchName: user.branchName,
    loggedInAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // localStorage may be unavailable
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

/** Only Head Office can switch branches */
export function canSwitchBranch(session: AuthSession | null): boolean {
  return session?.role === 'headoffice';
}

/**
 * Switch active branch context (HO only).
 * Returns updated session or null if not allowed / invalid branch.
 */
export function switchActiveBranch(branchCode: string): AuthSession | null {
  const session = getSession();
  if (!session || !canSwitchBranch(session)) return null;

  const branch = getBranchByCode(branchCode);
  if (!branch) return null;

  const updated: AuthSession = {
    ...session,
    activeBranchCode: branch.code,
    activeBranchName: branch.name,
  };

  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }

  return updated;
}

/** Branches the current user is allowed to see/select */
export function getAccessibleBranches(session: AuthSession | null): Branch[] {
  if (!session) return [];
  if (session.role === 'headoffice') return BRANCHES;
  // Branch users: only their own branch
  const own = getBranchByCode(session.homeBranchCode);
  return own ? [own] : [];
}
