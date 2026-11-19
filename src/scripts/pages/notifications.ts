import { getSession } from '../../lib/auth';
import { ago, listNotifications, markAllRead, markRead, type AppNotification } from '../../lib/notifications';

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

if (!getSession()) window.location.replace('/');

let all: AppNotification[] = [];

function render(): void {
  const mode = ($('nt-filter') as HTMLSelectElement).value;
  const rows = all.filter((n) => {
    if (mode === 'unread') return !n.isRead;
    if (mode === 'tasks') return n.kind.startsWith('task');
    if (mode === 'followups') return n.kind.startsWith('followup');
    return true;
  });
  $('nt-count').textContent = `${rows.length} notification${rows.length === 1 ? '' : 's'}`;
  $('nt-list').innerHTML = rows.length
    ? rows
        .map(
          (n) => `<li class="nt-item${n.isRead ? '' : ' is-unread'}" data-id="${n.id}" data-link="${esc(n.link)}">
            <span class="nt-dot"></span>
            <div class="nt-main"><div class="nt-title">${esc(n.title)}</div>${n.body ? `<div class="nt-body">${esc(n.body)}</div>` : ''}</div>
            <span class="nt-when">${esc(ago(n.createdAt))}</span></li>`,
        )
        .join('')
    : '<li class="pu-empty">Nothing here.</li>';
  document.querySelectorAll<HTMLElement>('.nt-item').forEach((el) =>
    el.addEventListener('click', async () => {
      await markRead(Number(el.dataset.id)).catch(() => {});
      if (el.dataset.link) window.location.href = el.dataset.link;
      else {
        const n = all.find((x) => x.id === Number(el.dataset.id));
        if (n) n.isRead = true;
        render();
      }
    }),
  );
}

async function load(): Promise<void> {
  try {
    all = await listNotifications();
  } catch {
    all = [];
    $('nt-list').innerHTML = '<li class="pu-empty">Could not load notifications.</li>';
    return;
  }
  render();
}

$('nt-filter').addEventListener('change', render);
$('nt-refresh').addEventListener('click', () => void load());
$('nt-readall').addEventListener('click', async () => {
  await markAllRead().catch(() => {});
  await load();
});
void load();
