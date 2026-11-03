/**
 * Navigation menu definitions.
 * Later this will be driven by Django permissions / role + branch.
 */

import type { UserRole } from './auth';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: string; // simple key used by the sidebar to pick an SVG
}

const ALL_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', href: '/dashboard', icon: 'home' },
  { id: 'inventory', label: 'Inventory', href: '/dashboard/inventory', icon: 'box' },
  { id: 'sales', label: 'Sales', href: '/dashboard/sales', icon: 'cart' },
  { id: 'purchase', label: 'Purchase', href: '/dashboard/purchase', icon: 'clipboard' },
  { id: 'payments', label: 'Payments', href: '/dashboard/payments', icon: 'wallet' },
  { id: 'customers', label: 'Customers', href: '/dashboard/customers', icon: 'users' },
  { id: 'reports', label: 'Reports', href: '/dashboard/reports', icon: 'chart' },
];

/** Role → visible menu ids (easy to replace with backend response later) */
const ROLE_MENU: Record<UserRole, string[]> = {
  headoffice: ['overview', 'inventory', 'sales', 'purchase', 'payments', 'customers', 'reports'],
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
