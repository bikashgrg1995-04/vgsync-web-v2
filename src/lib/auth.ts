/**
 * Demo authentication helpers for VGSync frontend.
 * Replace with real Django API calls later.
 */

export type UserRole = 'headoffice' | 'branch_manager' | 'staff';

export interface DemoUser {
  branchCode: string;
  username: string;
  password: string;
  displayName: string;
  role: UserRole;
  roleLabel: string;
  branchName: string;
}

export interface AuthSession {
  branchCode: string;
  username: string;
  displayName: string;
  role: UserRole;
  roleLabel: string;
  branchName: string;
  loggedInAt: string;
}

export const DEMO_USERS: DemoUser[] = [
  {
    branchCode: 'HO',
    username: 'admin',
    password: 'admin123',
    displayName: 'Bikash Gurung',
    role: 'headoffice',
    roleLabel: 'Head Office Admin',
    branchName: 'Head Office',
  },
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
];

const SESSION_KEY = 'vgsync-session';

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
    branchCode: user.branchCode,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    roleLabel: user.roleLabel,
    branchName: user.branchName,
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
