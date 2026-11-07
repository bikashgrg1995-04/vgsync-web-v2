/**
 * Navigation menu definitions — aligned with the VGSync design mock.
 */

import type { UserRole } from './auth';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: string;
}

const ALL_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Dashboard', href: '/dashboard', icon: 'home' },
  { id: 'inventory', label: 'Inventory', href: '/dashboard/inventory', icon: 'box' },
  { id: 'purchase', label: 'Purchase', href: '/dashboard/purchase', icon: 'clipboard' },
  { id: 'sales', label: 'Sales', href: '/dashboard/sales', icon: 'cart' },
  { id: 'returns', label: 'Returns', href: '/dashboard/returns', icon: 'returns' },
  { id: 'payments', label: 'Payments', href: '/dashboard/payments', icon: 'wallet' },
  { id: 'reports', label: 'Reports', href: '/dashboard/reports', icon: 'chart' },
  { id: 'customers', label: 'Customers', href: '/dashboard/customers', icon: 'users' },
  { id: 'servicing', label: 'Servicing', href: '/dashboard/servicing', icon: 'wrench' },
  { id: 'orders', label: 'Orders', href: '/dashboard/orders', icon: 'truck' },
  { id: 'suppliers', label: 'Suppliers', href: '/dashboard/suppliers', icon: 'truck' },
  { id: 'staff', label: 'Staff', href: '/dashboard/staff', icon: 'users' },
  { id: 'branches', label: 'Branches', href: '/dashboard/branches', icon: 'building' },
];

/** Primary sidebar order matching the design mock. Extra modules stay available by role. */
const ROLE_MENU: Record<UserRole, string[]> = {
  owner: [
    'overview',
    'inventory',
    'purchase',
    'sales',
    'returns',
    'payments',
    'reports',
    'customers',
    'servicing',
    'orders',
    'suppliers',
    'staff',
    'branches',
  ],
  branch_owner: [
    'overview',
    'inventory',
    'purchase',
    'sales',
    'returns',
    'payments',
    'reports',
    'customers',
    'servicing',
    'orders',
    'suppliers',
    'staff',
  ],
  headoffice: [
    'overview',
    'inventory',
    'purchase',
    'sales',
    'returns',
    'payments',
    'reports',
    'customers',
    'servicing',
    'orders',
    'suppliers',
  ],
  branch_manager: [
    'overview',
    'inventory',
    'purchase',
    'sales',
    'returns',
    'payments',
    'reports',
    'customers',
    'servicing',
    'orders',
    'suppliers',
  ],
  staff: ['overview', 'inventory', 'sales', 'customers', 'servicing'],
};

/**
 * `canManageTeam` decides the Staff item (the owner, or staff whose position
 * grants the staff module). Pages call this at build time without it, which
 * keeps the Staff link in the HTML; the app shell then calls it with the real
 * value and hides what the signed-in person cannot use.
 */
export function getNavItemsForRole(role: UserRole, canManageTeam?: boolean): NavItem[] {
  const base = (ROLE_MENU[role] ?? ['overview']).filter((id) => id !== 'staff');
  const allowed = canManageTeam === false ? base : [...base, 'staff'];
  return ALL_ITEMS.filter((item) => allowed.includes(item.id));
}

export const BOTTOM_NAV: NavItem[] = [
  { id: 'settings', label: 'Settings', href: '/dashboard/settings', icon: 'settings' },
  { id: 'help', label: 'Help & Support', href: '/dashboard/help', icon: 'help' },
  { id: 'logout', label: 'Logout', href: '#logout', icon: 'logout' },
];
