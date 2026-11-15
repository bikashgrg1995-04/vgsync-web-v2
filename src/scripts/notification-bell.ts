/**
 * The bell in the header: an unread count that refreshes every minute and a
 * short list of the latest notifications. Clicking one marks it read and
 * opens what it is about.
 */

import { getSession } from '../lib/auth';
import { ago, listNotifications, markAllRead, markRead, unreadCount, type AppNotification } from '../lib/notifications';

const btn = document.getElementById('notif-btn');
const panel = document.getElementById('notif-panel');
const list = document.getElementById('notif-list');
const badge = document.getElementById('notif-count');
const readAll = document.getElementById('notif-readall');

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function refreshCount(): Promise<void> {
  if (!getSession() || !badge) return;
  try {
    const n = await unreadCount();
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.hidden = n === 0;
  } catch {
    // The bell is a convenience; leave it as it was.
  }
}

function paint(items: AppNotification[]): void {
  if (!list) return;
  list.innerHTML = items.length
    ? items
        .map(
          (n) => `<li><button type="button" class="notif-item${n.isRead ? '' : ' is-unread'}" data-id="${n.id}" data-link="${esc(n.link)}">
            <span class="notif-title">${esc(n.title)}</span>${n.body ? `<span class="notif-body">${esc(n.body)}</span>` : ''}
            <span class="notif-when">${esc(ago(n.createdAt))}</span></button></li>`,
        )
        .join('')
    : '<li class="notif-empty">You are all caught up.</li>';

  list.querySelectorAll<HTMLButtonElement>('.notif-item').forEach((el) =>
    el.addEventListener('click', async () => {
      try {
        await markRead(Number(el.dataset.id));
      } catch {
        // Opening the page matters more than the read mark.
      }
      window.location.href = el.dataset.link || '/dashboard/notifications';
    }),
  );
}

async function openPanel(): Promise<void> {
  if (!panel || !btn) return;
  panel.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  try {
    paint(await listNotifications({ page_size: '8' }));
  } catch {
    if (list) list.innerHTML = '<li class="notif-empty">Could not load notifications.</li>';
  }
}

function closePanel(): void {
  if (!panel || !btn) return;
  panel.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
}

btn?.addEventListener('click', (event) => {
  event.stopPropagation();
  if (panel?.hidden) void openPanel();
  else closePanel();
});
document.addEventListener('click', (event) => {
  if (panel && !panel.hidden && !panel.contains(event.target as Node)) closePanel();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closePanel();
});
readAll?.addEventListener('click', async () => {
  try {
    await markAllRead();
  } catch {
    return;
  }
  await refreshCount();
  paint(await listNotifications({ page_size: '8' }).catch(() => []));
});

void refreshCount();
window.setInterval(() => {
  if (!document.hidden) void refreshCount();
}, 60_000);
