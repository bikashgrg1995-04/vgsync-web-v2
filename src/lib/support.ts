/**
 * Help & Support, from the API (/api/v1/support/): FAQs, support tickets and
 * the VGSync team's contact details.
 *
 * Tickets belong to the active business. The owner sees all of them, staff
 * see their own. Only the VGSync team changes a ticket's status.
 */

import { api } from './api';

export type TicketStatus = 'open' | 'in_progress' | 'resolved';

export type TicketCategory =
  | 'inventory'
  | 'purchase'
  | 'sales'
  | 'payments'
  | 'reports'
  | 'account'
  | 'other';

export interface Faq {
  id: number;
  question: string;
  answer: string;
}

export interface Ticket {
  id: number;
  /** The number people quote, like TKT-00124. */
  reference: string;
  subject: string;
  category: TicketCategory;
  categoryLabel: string;
  description: string;
  status: TicketStatus;
  statusLabel: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketInput {
  subject: string;
  category: TicketCategory;
  description: string;
}

export interface SupportContact {
  email: string;
  phone: string;
  hours: string;
  replyTime: string;
  /** Empty when no guide has been set up. */
  userGuideUrl: string;
  /** Empty when no tutorials have been set up. */
  videoTutorialsUrl: string;
}

interface ApiTicket {
  id: number;
  reference: string;
  subject: string;
  category: TicketCategory;
  category_label: string;
  description: string;
  status: TicketStatus;
  status_label: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

interface Page<T> {
  count: number;
  next: string | null;
  results: T[];
}

export const CATEGORIES: ReadonlyArray<{ value: TicketCategory; label: string }> = [
  { value: 'inventory', label: 'Inventory' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'sales', label: 'Sales' },
  { value: 'payments', label: 'Payments' },
  { value: 'reports', label: 'Reports' },
  { value: 'account', label: 'Account & branches' },
  { value: 'other', label: 'Other' },
];

function ticketFromApi(t: ApiTicket): Ticket {
  return {
    id: t.id,
    reference: t.reference,
    subject: t.subject,
    category: t.category,
    categoryLabel: t.category_label,
    description: t.description,
    status: t.status,
    statusLabel: t.status_label,
    createdBy: t.created_by_name,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

/** Published FAQs in the team's order. `search` looks in question and answer. */
export async function listFaqs(search = ''): Promise<Faq[]> {
  const query = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : '';
  const all: Faq[] = [];
  let page = 1;

  for (;;) {
    const data = await api<Page<Faq>>(`/support/faqs/?page=${page}&page_size=100${query}`);
    all.push(...data.results);
    if (!data.next) break;
    page += 1;
  }

  return all;
}

/** The newest tickets of the active business (one page of up to 100). */
export async function listTickets(): Promise<Ticket[]> {
  const data = await api<Page<ApiTicket>>('/support/tickets/?page_size=100');
  return data.results.map(ticketFromApi);
}

export async function createTicket(input: TicketInput): Promise<Ticket> {
  const body = {
    subject: input.subject.trim(),
    category: input.category,
    description: input.description.trim(),
  };

  return ticketFromApi(await api<ApiTicket>('/support/tickets/', { method: 'POST', body }));
}

export async function getContact(): Promise<SupportContact> {
  const data = await api<{
    email: string;
    phone: string;
    hours: string;
    reply_time: string;
    user_guide_url: string;
    video_tutorials_url: string;
  }>('/support/contact/');

  return {
    email: data.email,
    phone: data.phone,
    hours: data.hours,
    replyTime: data.reply_time,
    userGuideUrl: data.user_guide_url,
    videoTutorialsUrl: data.video_tutorials_url,
  };
}

export function formatTicketDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTicketDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
