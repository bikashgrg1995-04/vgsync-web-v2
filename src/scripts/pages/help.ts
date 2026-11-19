import { getSession } from '../../lib/auth';
import { ApiError } from '../../lib/api';
import {
  listFaqs, listTickets, createTicket, getContact,
  formatTicketDate, formatTicketDateTime,
  type Faq, type Ticket, type TicketCategory, type SupportContact,
} from '../../lib/support';

if (!getSession()) window.location.replace('/');

const FAQ_PAGE_SIZE = 5;
const TICKET_PREVIEW = 5;
let faqs: Faq[] = [];
let tickets: Ticket[] = [];
let faqPage = 1;
let showAllTickets = false;
let faqToken = 0;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const input = (id: string) => $<HTMLInputElement>(id)!;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const FIELD_LABELS: Record<string, string> = { subject: 'Subject', category: 'Category', description: 'Description' };

function describe(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  const entries = Object.entries(error.fields);
  if (entries.length > 0 && error.status === 400) {
    return entries.map(([key, msg]) => `${FIELD_LABELS[key] ?? key}: ${msg}`).join(' ');
  }
  return error.message;
}

function showBox(id: string, message: string | null): void {
  const el = $(id);
  if (!el) return;
  el.hidden = !message;
  el.textContent = message ?? '';
}

function renderFaqs(searching: boolean): void {
  const list = $('hs-faq-list');
  const pager = $('hs-faq-pager');
  if (!list) return;

  if (faqs.length === 0) {
    list.innerHTML = `<p class="hs-empty">${searching ? 'No help articles match your search.' : 'No questions have been added yet.'}</p>`;
    if (pager) { pager.hidden = true; pager.innerHTML = ''; }
    return;
  }

  const totalPages = searching ? 1 : Math.max(1, Math.ceil(faqs.length / FAQ_PAGE_SIZE));
  if (faqPage > totalPages) faqPage = totalPages;
  if (faqPage < 1) faqPage = 1;

  const start = searching ? 0 : (faqPage - 1) * FAQ_PAGE_SIZE;
  const visible = searching ? faqs : faqs.slice(start, start + FAQ_PAGE_SIZE);

  list.innerHTML = visible.map((f) =>
    `<details class="hs-faq"><summary><span>${esc(f.question)}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </summary><p class="hs-pre">${esc(f.answer)}</p></details>`
  ).join('');

  if (!pager) return;
  if (searching || totalPages <= 1) { pager.hidden = true; pager.innerHTML = ''; return; }

  pager.hidden = false;
  const from = start + 1;
  const to = start + visible.length;
  const pages: string[] = [];
  for (let p = 1; p <= totalPages; p += 1) {
    pages.push(`<button type="button" class="hs-page-btn${p === faqPage ? ' is-active' : ''}" data-faq-page="${p}" ${p === faqPage ? 'aria-current="page"' : ''}>${p}</button>`);
  }
  pager.innerHTML = `
    <button type="button" class="hs-page-btn hs-page-nav" data-faq-page="${faqPage - 1}" ${faqPage <= 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>
    ${pages.join('')}
    <button type="button" class="hs-page-btn hs-page-nav" data-faq-page="${faqPage + 1}" ${faqPage >= totalPages ? 'disabled' : ''} aria-label="Next page">›</button>
    <span class="hs-page-meta">${from}–${to} of ${faqs.length}</span>`;
}

async function loadFaqs(search = ''): Promise<void> {
  const token = ++faqToken;
  const searching = search.trim().length > 0;
  try {
    const result = await listFaqs(search);
    if (token !== faqToken) return;
    faqs = result;
    if (searching) faqPage = 1;
    showBox('hs-faq-note', searching ? `${faqs.length} result${faqs.length === 1 ? '' : 's'} for “${search.trim()}”` : null);
    renderFaqs(searching);
  } catch (error) {
    if (token !== faqToken) return;
    faqs = [];
    const list = $('hs-faq-list');
    if (list) list.innerHTML = `<p class="hs-empty hs-error">${esc(describe(error))}</p>`;
    const pager = $('hs-faq-pager');
    if (pager) { pager.hidden = true; pager.innerHTML = ''; }
  }
}

function statusClass(status: string): string {
  return `hs-badge hs-badge-${status.replace('_', '-')}`;
}

function renderTickets(): void {
  const body = $('hs-tickets-body');
  const more = $<HTMLButtonElement>('hs-tickets-all');
  if (!body) return;
  if (tickets.length === 0) {
    body.innerHTML = `<tr><td colspan="6" class="hs-empty">No support tickets yet.</td></tr>`;
    if (more) more.hidden = true;
    return;
  }
  const visible = showAllTickets ? tickets : tickets.slice(0, TICKET_PREVIEW);
  body.innerHTML = visible.map((t) => `<tr>
    <td class="hs-mono">${esc(t.reference)}</td>
    <td>${esc(t.subject)}</td>
    <td>${esc(t.categoryLabel)}</td>
    <td><span class="${statusClass(t.status)}">${esc(t.statusLabel)}</span></td>
    <td>${esc(formatTicketDate(t.createdAt))}</td>
    <td class="hs-right"><button type="button" class="hs-link" data-ticket-id="${t.id}">View</button></td>
  </tr>`).join('');
  if (more) {
    more.hidden = tickets.length <= TICKET_PREVIEW;
    more.textContent = showAllTickets ? 'Show less' : 'View All →';
  }
}

async function loadTickets(): Promise<void> {
  try {
    tickets = await listTickets();
    showBox('hs-tickets-error', null);
    renderTickets();
  } catch (error) {
    tickets = [];
    const body = $('hs-tickets-body');
    if (body) body.innerHTML = `<tr><td colspan="6" class="hs-empty hs-error">${esc(describe(error))}</td></tr>`;
    const more = $('hs-tickets-all');
    if (more) more.hidden = true;
    showBox('hs-tickets-error', describe(error));
  }
}

async function loadContact(): Promise<void> {
  try {
    const c = await getContact();
    const email = $('hs-email') as HTMLAnchorElement | null;
    const phone = $('hs-phone') as HTMLAnchorElement | null;
    if (email) { email.textContent = c.email || '—'; email.href = c.email ? `mailto:${c.email}` : '#'; }
    if (phone) { phone.textContent = c.phone || '—'; phone.href = c.phone ? `tel:${c.phone.replace(/\s/g, '')}` : '#'; }
    const reply = $('hs-reply-time'); if (reply) reply.textContent = c.replyTime || '';
    const hours = $('hs-hours'); if (hours) hours.textContent = c.hours || '';
    const guide = $('hs-guide') as HTMLAnchorElement | null;
    const guideNone = $('hs-guide-none');
    if (c.userGuideUrl && guide) { guide.href = c.userGuideUrl; guide.hidden = false; if (guideNone) guideNone.hidden = true; }
    else { if (guide) guide.hidden = true; if (guideNone) guideNone.hidden = false; }
    showBox('hs-contact-error', null);
  } catch (error) {
    showBox('hs-contact-error', describe(error));
  }
}

const ticketDialog = $('hs-ticket-dialog') as HTMLDialogElement | null;
const viewDialog = $('hs-view-dialog') as HTMLDialogElement | null;

function openTicketForm(): void {
  showBox('hs-f-error', null);
  input('hs-f-subject').value = '';
  const cat = $<HTMLSelectElement>('hs-f-category'); if (cat) cat.value = 'other';
  const desc = $<HTMLTextAreaElement>('hs-f-description'); if (desc) desc.value = '';
  ticketDialog?.showModal();
}

$('hs-act-ticket')?.addEventListener('click', openTicketForm);
$('hs-urgent-ticket')?.addEventListener('click', openTicketForm);
$('hs-f-cancel')?.addEventListener('click', () => ticketDialog?.close());
ticketDialog?.addEventListener('click', (e) => { if (e.target === ticketDialog) ticketDialog.close(); });
$('hs-v-close')?.addEventListener('click', () => viewDialog?.close());
viewDialog?.addEventListener('click', (e) => { if (e.target === viewDialog) viewDialog.close(); });

$('hs-tickets-body')?.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('[data-ticket-id]') as HTMLElement | null;
  if (!btn) return;
  const id = Number(btn.dataset.ticketId);
  const t = tickets.find((x) => x.id === id);
  if (!t || !viewDialog) return;
  $('hs-v-ref')!.textContent = t.reference;
  $('hs-v-subject')!.textContent = t.subject;
  const badge = $('hs-v-status');
  if (badge) { badge.className = statusClass(t.status); badge.textContent = t.statusLabel; }
  $('hs-v-category')!.textContent = t.categoryLabel;
  $('hs-v-by')!.textContent = t.createdBy || '—';
  $('hs-v-created')!.textContent = formatTicketDateTime(t.createdAt);
  $('hs-v-updated')!.textContent = formatTicketDateTime(t.updatedAt);
  $('hs-v-description')!.textContent = t.description;
  viewDialog.showModal();
});

$('hs-ticket-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const save = $<HTMLButtonElement>('hs-f-save');
  if (save) save.disabled = true;
  showBox('hs-f-error', null);
  try {
    const ticket = await createTicket({
      subject: input('hs-f-subject').value.trim(),
      category: ($<HTMLSelectElement>('hs-f-category')?.value || 'other') as TicketCategory,
      description: ($<HTMLTextAreaElement>('hs-f-description')?.value || '').trim(),
    });
    ticketDialog?.close();
    showBox('hs-ticket-ok', `Ticket #${ticket.reference} was created. Our team will get back to you soon.`);
    await loadTickets();
  } catch (error) {
    showBox('hs-f-error', describe(error));
  } finally {
    if (save) save.disabled = false;
  }
});

$('hs-search-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  faqPage = 1;
  void loadFaqs(input('hs-search').value);
  $('hs-faq-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

input('hs-search')?.addEventListener('input', () => {
  if (input('hs-search').value.trim() === '') { faqPage = 1; void loadFaqs(''); }
});

$('hs-act-help')?.addEventListener('click', () => {
  faqPage = 1; void loadFaqs('');
  $('hs-faq-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('hs-act-contact')?.addEventListener('click', () => {
  $('hs-contact-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

$('hs-faq-pager')?.addEventListener('click', (event) => {
  const btn = (event.target as HTMLElement).closest('[data-faq-page]') as HTMLElement | null;
  if (!btn || btn.hasAttribute('disabled')) return;
  const page = Number(btn.dataset.faqPage);
  if (!Number.isFinite(page) || page < 1) return;
  faqPage = page;
  renderFaqs(false);
  $('hs-faq-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('hs-tickets-all')?.addEventListener('click', () => {
  showAllTickets = !showAllTickets;
  renderTickets();
});

void loadFaqs();
void loadTickets();
void loadContact();
