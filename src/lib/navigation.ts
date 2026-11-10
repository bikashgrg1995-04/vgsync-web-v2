/**
 * Navigation menu definitions.
 *
 * Eight areas for the owner: Dashboard, Sales & Orders, Purchases, Finance,
 * Inventory, Reports & Analytics, Staff Management and Settings (the last
 * one lives in the sidebar footer). What each person sees follows their
 * permissions: an item shows when the person holds its `perm`. The API
 * enforces the same rules; this only decides what is shown.
 */

import type { UserRole } from './auth';

export interface NavGroup {
  id: string;
  label: string | null;
}

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  group: string;
  /** Permission code needed to see the item. Missing: everyone. */
  perm?: string;
  /** Special rules the app shell understands. */
  rule?: 'company_owner' | 'approvals';
}

export const NAV_GROUPS: NavGroup[] = [
  { id: 'main', label: null },
  { id: 'sales', label: 'Sales & Orders' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'finance', label: 'Finance' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'reports', label: 'Reports & Analytics' },
  { id: 'staff', label: 'Staff Management' },
];

const ALL_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Dashboard', href: '/dashboard', icon: 'home', group: 'main' },
  { id: 'branches', label: 'Branches', href: '/dashboard/branches', icon: 'building', group: 'main', rule: 'company_owner' },

  { id: 'sales', label: 'Sales', href: '/dashboard/sales', icon: 'cart', group: 'sales', perm: 'sales.view' },
  { id: 'orders', label: 'Orders', href: '/dashboard/orders', icon: 'truck', group: 'sales', perm: 'orders.view' },
  { id: 'returns', label: 'Returns', href: '/dashboard/returns', icon: 'returns', group: 'sales', perm: 'sales.view' },
  { id: 'customers', label: 'Customers', href: '/dashboard/customers', icon: 'users', group: 'sales', perm: 'sales.view' },
  { id: 'servicing', label: 'Servicing', href: '/dashboard/servicing', icon: 'wrench', group: 'sales', perm: 'sales.view' },

  { id: 'purchase', label: 'Purchase', href: '/dashboard/purchase', icon: 'clipboard', group: 'purchases', perm: 'purchases.view' },
  { id: 'suppliers', label: 'Suppliers', href: '/dashboard/suppliers', icon: 'truck', group: 'purchases', perm: 'purchases.view' },

  { id: 'payments', label: 'Payments', href: '/dashboard/payments', icon: 'wallet', group: 'finance', perm: 'finance.view' },
  { id: 'approvals', label: 'Approvals', href: '/dashboard/approvals', icon: 'shield', group: 'finance', rule: 'approvals' },

  { id: 'inventory', label: 'Inventory', href: '/dashboard/inventory', icon: 'box', group: 'inventory', perm: 'inventory.view' },

  { id: 'reports', label: 'Reports', href: '/dashboard/reports', icon: 'chart', group: 'reports', perm: 'reports.view' },

  { id: 'staff', label: 'Staff', href: '/dashboard/staff', icon: 'users', group: 'staff', perm: 'staff.view' },
];

/** Codes that let a person decide an approval request. */
export const APPROVER_CODES = [
  'purchases.approve',
  'finance.approve',
  'inventory.approve',
  'sales.approve',
];

export interface NavViewer {
  isOwner: boolean;
  permissions: string[];
  /** Company owner working in Head Office. */
  companyOwner: boolean;
}

/** Whether `viewer` should see `item`. */
export function navItemVisible(item: NavItem, viewer: NavViewer): boolean {
  if (item.rule === 'company_owner') return viewer.companyOwner;

  if (item.rule === 'approvals') {
    return viewer.isOwner || APPROVER_CODES.some((c) => viewer.permissions.includes(c));
  }

  if (!item.perm) return true;

  return viewer.isOwner || viewer.permissions.includes(item.perm);
}

/**
 * Pages are built without a session, so they ask for the full menu; the app
 * shell then hides what the signed-in person cannot use. The parameters stay
 * so existing callers keep working.
 */
export function getNavItemsForRole(_role?: UserRole, _canManageTeam?: boolean): NavItem[] {
  return ALL_ITEMS;
}

export const BOTTOM_NAV: NavItem[] = [
  { id: 'settings', label: 'Settings', href: '/dashboard/settings', icon: 'settings', group: 'bottom' },
  { id: 'help', label: 'Help & Support', href: '/dashboard/help', icon: 'help', group: 'bottom' },
  { id: 'logout', label: 'Logout', href: '#logout', icon: 'logout', group: 'bottom' },
];
