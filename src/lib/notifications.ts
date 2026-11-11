/** Your notifications in the active business (/api/v1/notifications/). */

import { api } from './api';

export interface AppNotification {
  id: number;
  kind: string;
  title: string;
  body: string;
  link: string;
  isRead: boolean;
  createdAt: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const map = (r: any): AppNotification => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  body: r.body ?? '',
  link: r.link || (String(r.kind).startsWith('followup') ? '/dashboard/sales#followups' : ''),
  isRead: Boolean(r.is_read),
  createdAt: r.created_at,
});

export async function listNotifications(params: Record<string, string> = {}): Promise<AppNotification[]> {
  const query = new URLSearchParams({ page_size: '100', ...params }).toString();
  const data = await api<any>(`/notifications/?${query}`);

  return (Array.isArray(data) ? data : data.results).map(map);
}

export async function unreadCount(): Promise<number> {
  return (await api<{ unread: number }>('/notifications/unread-count/')).unread;
}

export async function markRead(id: number): Promise<void> {
  await api(`/notifications/${id}/read/`, { method: 'POST' });
}

export async function markAllRead(): Promise<void> {
  await api('/notifications/read-all/', { method: 'POST' });
}

/** When something happened, in a few words ("5 min ago", "yesterday"). */
export function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 172800) return 'yesterday';
  return new Date(iso).toLocaleDateString();
}
