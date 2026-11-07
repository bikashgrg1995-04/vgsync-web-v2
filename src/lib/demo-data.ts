/**
 * Demo branch connection + sample metrics.
 * Replace with Django API responses later.
 */

export interface BranchDemoStats {
  code: string;
  name: string;
  city: string;
  status: 'online' | 'offline' | 'syncing';
  lastSync: string;
  salesToday: number;
  stockValue: number;
  pendingOrders: number;
  lowStockItems: number;
}

export const BRANCH_DEMO_STATS: BranchDemoStats[] = [
  {
    code: 'HO',
    name: 'Head Office',
    city: 'Kathmandu',
    status: 'online',
    lastSync: 'Just now',
    salesToday: 0,
    stockValue: 0,
    pendingOrders: 0,
    lowStockItems: 0,
  },
  {
    code: 'BHP',
    name: 'Bharatpur Branch',
    city: 'Bharatpur',
    status: 'online',
    lastSync: '2 min ago',
    salesToday: 128450,
    stockValue: 2156300,
    pendingOrders: 7,
    lowStockItems: 12,
  },
  {
    code: 'PKR',
    name: 'Pokhara Branch',
    city: 'Pokhara',
    status: 'online',
    lastSync: '5 min ago',
    salesToday: 89200,
    stockValue: 1845000,
    pendingOrders: 4,
    lowStockItems: 8,
  },
  {
    code: 'BTL',
    name: 'Butwal Branch',
    city: 'Butwal',
    status: 'syncing',
    lastSync: '18 min ago',
    salesToday: 45600,
    stockValue: 980000,
    pendingOrders: 2,
    lowStockItems: 5,
  },
];

export function getBranchStats(code: string): BranchDemoStats | undefined {
  return BRANCH_DEMO_STATS.find(
    (b) => b.code.toUpperCase() === code.trim().toUpperCase(),
  );
}

export function formatNPR(n: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
    maximumFractionDigits: 0,
  }).format(n);
}
