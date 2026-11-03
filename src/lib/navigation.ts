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
  { id: 'payments', label: 'Payments', href: '/dashboard/payments', icon: 'wallet' },
  { id: 'customers', label: 'Customers', href: '/dashboard/customers', icon: 'users' },
  { id: 'staff', label: 'Staff', href: '/dashboard/staff', icon: 'users' },
  { id: 'reports', label: 'Reports', href: '/dashboard/reports', icon: 'chart' },
];

const ROLE_MENU: Record<UserRole, string[]> = {
  owner: ['overview', 'inventory', 'sales', 'purchase', 'payments', 'customers', 'staff', 'reports'],
  headoffice: ['overview', 'inventory', 'sales', 'purchase', 'payments', 'customers', 'staff', 'reports'],
  branch_manager: ['overview', 'inventory', 'sales', 'purchase', 'payments', 'customers', 'reports'],
  staff: ['overview', 'inventory', 'sales', 'customers'],
};

export function getNavItemsForRole(role: UserRole): NavItem[] {
  const allowed = ROLE_MENU[role] ?? ['overview'];
  return ALL_ITEMS.filter((item) => allowed.includes(item.id));
}

export const BOTTOM_NAV: NavItem[] = [
  { id: 'settings', label: 'Settings', href: '/dashboard/settings', icon: 'settings' },
  { id: 'logout', label: 'Logout', href: '#logout', icon: 'logout' },
];
