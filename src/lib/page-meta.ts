/** Shared page metadata for dashboard routes */

export interface PageMeta {
  id: string;
  title: string;
  breadcrumb: string;
  skeletonTitle: string;
  skeletonHint: string;
}

export const PAGE_META: Record<string, PageMeta> = {
  tasks: { id: 'tasks', title: 'Tasks', breadcrumb: 'Tasks /', skeletonTitle: 'Tasks', skeletonHint: '' },
  notifications: { id: 'notifications', title: 'Notifications', breadcrumb: 'Notifications /', skeletonTitle: 'Notifications', skeletonHint: '' },
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
  orders: {
    id: 'orders',
    title: 'Orders',
    breadcrumb: 'Orders /',
    skeletonTitle: 'Orders',
    skeletonHint: 'Stock orders between a branch and Head Office.',
  },
  payments: {
    id: 'payments',
    title: 'Payments',
    breadcrumb: 'Payments /',
    skeletonTitle: 'Payments',
    skeletonHint:
      'Receipts, payments and outstanding balances will appear here.<br />Scoped to the active branch.',
  },
  statements: {
    id: 'statements',
    title: 'Statements',
    breadcrumb: 'Finance /',
    skeletonTitle: 'Statements',
    skeletonHint: 'Customer and supplier statements.',
  },
  approvals: {
    id: 'approvals',
    title: 'Approvals',
    breadcrumb: 'Finance /',
    skeletonTitle: 'Approvals',
    skeletonHint: 'Requests waiting for a decision.',
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
  branches: {
    id: 'branches',
    title: 'Branches',
    breadcrumb: 'Company /',
    skeletonTitle: 'Branches',
    skeletonHint: 'Head Office and branches of the company.',
  },
  settings: {
    id: 'settings',
    title: 'Settings',
    breadcrumb: 'Settings /',
    skeletonTitle: 'Settings',
    skeletonHint: 'Profile, preferences and system settings will appear here.',
  },
  help: {
    id: 'help',
    title: 'Help & Support',
    breadcrumb: 'Help & Support /',
    skeletonTitle: 'Help & Support',
    skeletonHint: 'Find answers, get support, or track your requests.',
  },
  'change-password': {
    id: 'change-password',
    title: 'Update Password',
    breadcrumb: 'Security /',
    skeletonTitle: 'Update Password',
    skeletonHint: 'Set a new password before continuing.',
  },
};
