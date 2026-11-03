/** Shared page metadata for dashboard routes */

export interface PageMeta {
  id: string;
  title: string;
  breadcrumb: string;
  skeletonTitle: string;
  skeletonHint: string;
}

export const PAGE_META: Record<string, PageMeta> = {
  overview: {
    id: 'overview',
    title: 'Dashboard',
    breadcrumb: 'Overview /',
    skeletonTitle: 'Overview',
    skeletonHint:
      'Dashboard overview will appear here.<br />Branch-scoped KPIs and charts come from Django later.',
  },
  inventory: {
    id: 'inventory',
    title: 'Inventory',
    breadcrumb: 'Inventory /',
    skeletonTitle: 'Inventory',
    skeletonHint:
      'Stock list, adjustments and valuations will appear here.<br />Scoped to the active branch.',
  },
  sales: {
    id: 'sales',
    title: 'Sales',
    breadcrumb: 'Sales /',
    skeletonTitle: 'Sales',
    skeletonHint:
      'Sales invoices and order list will appear here.<br />Scoped to the active branch.',
  },
  purchase: {
    id: 'purchase',
    title: 'Purchase',
    breadcrumb: 'Purchase /',
    skeletonTitle: 'Purchase',
    skeletonHint:
      'Purchase orders and supplier bills will appear here.<br />Scoped to the active branch.',
  },
  suppliers: {
    id: 'suppliers',
    title: 'Suppliers',
    breadcrumb: 'Suppliers /',
    skeletonTitle: 'Suppliers',
    skeletonHint:
      'Supplier directory, contacts and payables will appear here.<br />Scoped to the active branch.',
  },
  payments: {
    id: 'payments',
    title: 'Payments',
    breadcrumb: 'Payments /',
    skeletonTitle: 'Payments',
    skeletonHint:
      'Receipts, payments and outstanding balances will appear here.<br />Scoped to the active branch.',
  },
  customers: {
    id: 'customers',
    title: 'Customers',
    breadcrumb: 'Customers /',
    skeletonTitle: 'Customers',
    skeletonHint:
      'Customer directory and ledgers will appear here.<br />Scoped to the active branch.',
  },
  staff: {
    id: 'staff',
    title: 'Staff',
    breadcrumb: 'Staff /',
    skeletonTitle: 'Staff',
    skeletonHint: 'Assign and manage branch staff accounts.',
  },
  reports: {
    id: 'reports',
    title: 'Reports',
    breadcrumb: 'Reports /',
    skeletonTitle: 'Reports',
    skeletonHint:
      'Business reports and exports will appear here.<br />Owner can run across branches.',
  },
  settings: {
    id: 'settings',
    title: 'Settings',
    breadcrumb: 'Settings /',
    skeletonTitle: 'Settings',
    skeletonHint: 'Profile, preferences and system settings will appear here.',
  },
  'change-password': {
    id: 'change-password',
    title: 'Update Password',
    breadcrumb: 'Security /',
    skeletonTitle: 'Update Password',
    skeletonHint: 'Set a new password before continuing.',
  },
};
