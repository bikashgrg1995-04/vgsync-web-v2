/**
 * Navigation menu definitions.
 *
 * Areas, in order: Dashboard, Sales, Purchases, Inventory, Money (payments,
 * statements, reports) and Team. Settings and Help live in the sidebar footer. What each person sees follows their
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
  /** Shown indented under this item (its sub-menu entry). */
  parent?: string;
  /** Permission code needed to see the item. Missing: everyone. */
  perm?: string;
  /** Special rules the app shell understands. */
  rule?: 'company_owner' | 'statements' | 'not_owner';
}

export const NAV_GROUPS: NavGroup[] = [
  { id: 'main', label: null },
  { id: 'sales', label: 'Sales' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'money', label: 'Money' },
  { id: 'team', label: 'Team' },
];

/*
 * Ten entries at the top level. Everything else sits under the one it belongs
 * to (`parent`) and opens when you are in that section.
 */
const ALL_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Dashboard', href: '/dashboard', icon: 'home', group: 'main' },
  // Everyone on the team can see their own pay; the owner has the Staff pay screen instead.
  { id: 'my-jobs', label: 'My jobs', href: '/my-jobs', icon: 'wrench', group: 'main', rule: 'not_owner' },
  { id: 'my-pay', label: 'My pay', href: '/my-pay', icon: 'wallet', group: 'main', rule: 'not_owner' },
  { id: 'tasks', label: 'Tasks', href: '/tasks', icon: 'clipboard', group: 'main' },
  { id: 'branches', label: 'Branches', href: '/branches', icon: 'building', group: 'main', rule: 'company_owner' },

  { id: 'sales', label: 'Sales', href: '/sales', icon: 'cart', group: 'sales', perm: 'sales.view' },
  { id: 'returns', label: 'Sales Return', href: '/sales#returns', icon: 'returns', group: 'sales', parent: 'sales', perm: 'sales.view' },
  { id: 'servicing', label: 'Follow-ups', href: '/sales#followups', icon: 'wrench', group: 'sales', parent: 'sales', perm: 'sales.view' },
  { id: 'customers', label: 'Customers', href: '/customers', icon: 'users', group: 'sales', parent: 'sales', perm: 'sales.view' },
  { id: 'orders', label: 'Orders', href: '/orders', icon: 'truck', group: 'sales', parent: 'sales', perm: 'orders.view' },

  { id: 'purchase', label: 'Purchase', href: '/purchase', icon: 'clipboard', group: 'purchases', perm: 'purchases.view' },
  { id: 'purchase-returns', label: 'Purchase Return', href: '/purchase#returns', icon: 'returns', group: 'purchases', parent: 'purchase', perm: 'purchases.view' },
  { id: 'suppliers', label: 'Suppliers', href: '/suppliers', icon: 'truck', group: 'purchases', parent: 'purchase', perm: 'purchases.view' },

  { id: 'inventory', label: 'Inventory', href: '/inventory', icon: 'box', group: 'inventory', perm: 'inventory.view' },

  { id: 'payments', label: 'Payments', href: '/payments', icon: 'wallet', group: 'money', perm: 'finance.view' },
  { id: 'statements', label: 'Statements', href: '/statements', icon: 'clipboard', group: 'money', parent: 'payments', rule: 'statements' },
  { id: 'reports', label: 'Reports', href: '/reports', icon: 'chart', group: 'money', parent: 'payments', perm: 'reports.view' },

  { id: 'staff', label: 'Staffs', href: '/staff#team', icon: 'users', group: 'team', perm: 'staff.view' },
  { id: 'positions', label: 'Position / Role', href: '/staff#positions', icon: 'shield', group: 'team', parent: 'staff', perm: 'staff.view' },
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
  if (item.rule === 'not_owner') return !viewer.isOwner;

  if (item.rule === 'statements') {
    return viewer.isOwner || viewer.permissions.includes('sales.view') || viewer.permissions.includes('purchases.view');
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
  { id: 'settings', label: 'Settings', href: '/settings', icon: 'settings', group: 'bottom' },
  { id: 'help', label: 'Help & Support', href: '/help', icon: 'help', group: 'bottom' },
  { id: 'logout', label: 'Logout', href: '#logout', icon: 'logout', group: 'bottom' },
];
