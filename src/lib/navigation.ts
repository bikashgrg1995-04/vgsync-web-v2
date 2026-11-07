/**
 * Navigation menu definitions.
 * Later this will be driven by Django permissions / role + branch.
 */

import type { UserRole } from './auth';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: string;
}

const ALL_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', href: '/dashboard', icon: 'home' },
  { id: 'inventory', label: 'Inventory', href: '/dashboard/inventory', icon: 'box' },
  { id: 'sales', label: 'Sales', href: '/dashboard/sales', icon: 'cart' },
  { id: 'purchase', label: 'Purchase', href: '/dashboard/purchase', icon: 'clipboard' },
  { id: 'orders', label: 'Orders', href: '/dashboard/orders', icon: 'truck' },
  { id: 'suppliers', label: 'Suppliers', href: '/dashboard/suppliers', icon: 'truck' },
  { id: 'payments', label: 'Payments', href: '/dashboard/payments', icon: 'wallet' },
  { id: 'customers', label: 'Customers', href: '/dashboard/customers', icon: 'users' },
  { id: 'staff', label: 'Staff', href: '/dashboard/staff', icon: 'users' },
  { id: 'reports', label: 'Reports', href: '/dashboard/reports', icon: 'chart' },
];

const ROLE_MENU: Record<UserRole, string[]> = {
  owner: [
    'overview',
    'inventory',
    'sales',
    'purchase',
    'orders',
    'suppliers',
    'payments',
    'customers',
    'staff',
    'reports',
  ],
  branch_owner: [
    'overview',
    'inventory',
    'sales',
    'purchase',
    'orders',
    'suppliers',
    'payments',
    'customers',
    'staff',
    'reports',
  ],
  headoffice: [
    'overview',
    'inventory',
    'sales',
    'purchase',
    'orders',
    'suppliers',
    'payments',
    'customers',
    'reports',
  ],
  branch_manager: [
    'overview',
    'inventory',
    'sales',
    'purchase',
    'orders',
    'suppliers',
    'payments',
    'customers',
    'reports',
  ],
  staff: ['overview', 'inventory', 'sales', 'customers'],
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
  { id: 'logout', label: 'Logout', href: '#logout', icon: 'logout' },
];
