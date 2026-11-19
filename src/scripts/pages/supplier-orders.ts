import { can, getSession } from '../../lib/auth';
import {
  $,
  esc,
  describe,
  configurePurchaseDialogs,
  openForm,
  openReceive,
  openReturn,
} from '../widgets/purchase-dialogs';
import { listSuppliers, type Supplier } from '../../lib/suppliers';
import { listStock, type StockItem } from '../../lib/inventory';
import { listPurchases, formatQty, type Purchase } from '../../lib/purchases';

const session = getSession();
if (!session) window.location.replace('/');
// Branches order from Head Office on the stock-order page.
else if (session.businessType !== 'independent') window.location.replace('/orders');
else if (!can(session, 'purchases.view')) window.location.replace('/dashboard');

let all: Purchase[] = [];
let suppliers: Supplier[] = [];
let products: StockItem[] = [];
let canWrite = true;

const sum = (p: Purchase, f: (l: Purchase['lines'][number]) => number) => p.lines.reduce((a, l) => a + f(l), 0);
/** Units that arrived damaged and are still here (not sent back). */
const damagedLeft = (p: Purchase) => sum(p, (l) => l.damagedQuantity);

function notice(message: string | null, error = false): void {
  const el = $('so-notice')!;
  el.textContent = message ?? '';
  el.hidden = !message;
  el.classList.toggle('is-error', error);
}

const STATUS: Record<string, string> = { draft: 'Waiting for goods', partial: 'Part received', received: 'Received', cancelled: 'Cancelled' };

function render(): void {
  const live = all.filter((p) => p.status !== 'cancelled');
  $('so-k-open')!.textContent = String(live.filter((p) => p.status === 'draft').length);
  $('so-k-part')!.textContent = String(live.filter((p) => p.status === 'partial').length);
  $('so-k-dmg')!.textContent = formatQty(live.reduce((a, p) => a + damagedLeft(p), 0));
  $('so-k-done')!.textContent = String(live.filter((p) => p.status === 'received').length);

  const mode = ($('so-filter') as unknown as HTMLSelectElement).value;
  const rows = all.filter((p) => {
    if (mode === 'open') return p.status === 'draft' || p.status === 'partial';
    if (mode === 'damaged') return p.status !== 'cancelled' && damagedLeft(p) > 0;
    if (mode === 'received') return p.status === 'received';
    return true;
  });
  $('so-count')!.textContent = `${rows.length} order${rows.length === 1 ? '' : 's'}`;
  const tbody = $('so-tbody')!;
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="pu-empty">${mode === 'open' ? 'No orders waiting for goods.' : 'Nothing here.'}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map((p) => {
      const good = sum(p, (l) => l.receivedQuantity - l.returnedQuantity) - damagedLeft(p);
      const open = p.status === 'draft' || p.status === 'partial';
      const acts = [
        canWrite && open ? `<button type="button" class="btn-primary-sm" data-act="receive" data-id="${p.id}">Receive</button>` : '',
        canWrite && damagedLeft(p) > 0 ? `<button type="button" class="btn-ghost-sm" data-act="return" data-id="${p.id}">Return damaged</button>` : '',
        `<a class="btn-ghost-sm pd-link-btn" href="/purchase/detail?id=${p.id}">View</a>`,
      ].join(' ');
      return `<tr>
        <td class="mono">${esc(p.purchaseNo)}</td>
        <td>${esc(p.purchaseDate)}</td>
        <td>${esc(p.supplierName)}</td>
        <td>${esc(STATUS[p.status] ?? p.status)}</td>
        <td class="num">${formatQty(sum(p, (l) => l.quantity))}</td>
        <td class="num">${formatQty(good)}</td>
        <td class="num">${formatQty(damagedLeft(p))}</td>
        <td>${acts}</td></tr>`;
    })
    .join('');
  tbody.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) =>
    b.addEventListener('click', () => {
      const p = all.find((x) => x.id === Number(b.dataset.id));
      if (!p) return;
      if (b.dataset.act === 'receive') openReceive(p);
      else openReturn(p);
    }),
  );
}

async function load(): Promise<void> {
  try {
    all = await listPurchases();
    notice(canWrite ? null : 'Read-only: you are viewing this business from the company owner account.');
  } catch (error) {
    all = [];
    notice(describe(error), true);
  }
  render();
}

configurePurchaseDialogs({
  getProducts: () => products,
  getSuppliers: () => suppliers,
  onChanged: async () => {
    await load();
    void listStock().then((s) => (products = s)).catch(() => {});
  },
});

$('so-filter')?.addEventListener('change', render);
$('so-refresh')?.addEventListener('click', () => void load());
$('so-new')?.addEventListener('click', () => openForm());

(async () => {
  const s = getSession();
  canWrite = !s || s.accessMode !== 'read_only';
  ($('so-new') as HTMLElement).hidden = !canWrite;
  [suppliers, products] = await Promise.all([listSuppliers().catch(() => []), listStock().catch(() => [])]);
  await load();
})();
