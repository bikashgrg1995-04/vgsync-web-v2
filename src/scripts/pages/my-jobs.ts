import { getSession } from '../../lib/auth';
import { listMyJobs, startMyJob, finishMyJob, requestJobLine, withdrawJobLine, JOB_STATUS_LABEL, JOB_LINE_STATUS_LABEL, SERVICE_KIND_LABEL, type MyJob } from '../../lib/sales';
import { listStock, type StockItem } from '../../lib/inventory';

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const session = getSession();
if (!session) window.location.replace('/');

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function showError(message: string | null): void {
  $('mj-error').hidden = !message;
  $('mj-error').textContent = message ?? '';
}

const failure = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

function card(j: MyJob): string {
  const bike = [j.regNo, j.chassisNo].filter(Boolean).join(' · ');
  const work = j.work.map((w) => `<li>${esc(w.description)}${Number(w.quantity) !== 1 ? ` × ${esc(w.quantity)}` : ''}</li>`).join('');
  const kind = j.serviceKind === 'paid' ? '' : ` · ${SERVICE_KIND_LABEL[j.serviceKind]}${j.freeServiceForNo ? ` of ${esc(j.freeServiceForNo)}` : ''}`;
  const lines = (j.lines.filter((l) => l.status !== 'withdrawn').map((l) => `<li>${l.kind === 'part' ? 'Part' : 'Work'}: ${esc(l.name)}${l.quantity !== 1 ? ` × ${l.quantity}` : ''} — <em>${JOB_LINE_STATUS_LABEL[l.status]}</em>${l.status === 'rejected' && l.rejectReason ? ` (${esc(l.rejectReason)})` : ''}${l.status === 'requested' ? ` <button type="button" class="btn-link is-danger" data-withdraw="${j.id}:${l.id}">Withdraw</button>` : ''}</li>`).join(''));
  const askButtons = j.canAddLines
    ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0"><button type="button" class="btn-ghost-sm" data-ask="part:${j.id}">+ Ask for a part</button><button type="button" class="btn-ghost-sm" data-ask="work:${j.id}">+ Add work</button></div>`
    : '';
  const action =
    j.jobStatus === 'pending'
      ? `<button type="button" class="btn-primary-sm" data-start="${j.id}">Start job</button>`
      : j.jobStatus === 'in_progress'
        ? `<button type="button" class="btn-primary-sm" data-done="${j.id}">Mark done</button>`
        : '';

  return `<article class="pu-card" style="padding:16px">
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <strong>${esc(j.saleNo)}${kind}</strong><span class="pu-count">${JOB_STATUS_LABEL[j.jobStatus]}</span>
    </div>
    <p style="margin:6px 0">${esc(j.customerName || 'Walk-in')}${j.customerPhone ? ` · <a href="tel:${esc(j.customerPhone)}">${esc(j.customerPhone)}</a>` : ''}</p>
    <p style="margin:6px 0">${bike ? `Bike: ${esc(bike)}` : ''}${j.odometerKm != null ? ` · ${j.odometerKm.toLocaleString('en-US')} km` : ''}</p>
    <ul style="margin:6px 0 6px 18px">${work}</ul>
    ${j.notes ? `<p style="margin:6px 0">Note: ${esc(j.notes)}</p>` : ''}
    <p class="pu-count" style="margin:6px 0">Given ${when(j.assignedAt)}${j.startedAt ? ` · started ${when(j.startedAt)}` : ''}${j.doneAt ? ` · done ${when(j.doneAt)}` : ''}</p>
    ${j.jobNotes ? `<p style="margin:6px 0">Your notes: ${esc(j.jobNotes)}</p>` : ''}
    ${lines ? `<ul style="margin:6px 0 6px 18px">${lines}</ul>` : ''}
    ${askButtons}
    ${action}
  </article>`;
}

async function load(): Promise<void> {
  showError(null);
  try {
    const jobs = await listMyJobs();
    $('mj-none').hidden = jobs.length > 0;
    $('mj-list').innerHTML = jobs.map(card).join('');
    document.querySelectorAll<HTMLButtonElement>('[data-ask]').forEach((b) =>
      b.addEventListener('click', () => void openAsk(b.dataset.ask!)),
    );
    document.querySelectorAll<HTMLButtonElement>('[data-withdraw]').forEach((b) =>
      b.addEventListener('click', async () => {
        const [job, line] = b.dataset.withdraw!.split(':').map(Number);
        try {
          await withdrawJobLine(job, line);
          await load();
        } catch (e) {
          showError(failure(e));
        }
      }),
    );
    document.querySelectorAll<HTMLButtonElement>('[data-start]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          await startMyJob(Number(b.dataset.start));
          await load();
        } catch (e) {
          showError(failure(e));
        }
      }),
    );
    document.querySelectorAll<HTMLButtonElement>('[data-done]').forEach((b) =>
      b.addEventListener('click', async () => {
        const notes = prompt('How did the work go / how does the bike run? (optional)', '');
        if (notes === null) return;
        try {
          await finishMyJob(Number(b.dataset.done), notes);
          await load();
        } catch (e) {
          showError(failure(e));
        }
      }),
    );
  } catch (e) {
    showError(failure(e));
  }
}

// ---- Ask for a part / add work -----------------------------------------

let askKind: 'part' | 'work' = 'part';
let askJob = 0;
let stock: StockItem[] | null = null;

async function openAsk(spec: string): Promise<void> {
  const [kind, job] = spec.split(':');
  askKind = kind as 'part' | 'work';
  askJob = Number(job);
  $('mj-dlg-title').textContent = askKind === 'part' ? 'Ask for a part' : 'Add work';
  $('mj-part-wrap').hidden = askKind !== 'part';
  $('mj-work-wrap').hidden = askKind !== 'work';
  ($('mj-qty') as HTMLInputElement).value = '1';
  ($('mj-note') as HTMLInputElement).value = '';
  ($('mj-work') as HTMLInputElement).value = '';
  $('mj-dlg-error').hidden = true;
  if (askKind === 'part') {
    try {
      stock ??= await listStock();
    } catch {
      stock = [];
    }
    $('mj-part').innerHTML = stock
      .map((s) => `<option value="${s.productId}">${esc(s.name)} (${esc(s.stockNo)}) · ${s.quantity} in stock · Rs ${s.salePrice}</option>`)
      .join('');
  }
  ($('mj-dlg') as HTMLDialogElement).showModal();
}

$('mj-cancel').addEventListener('click', () => ($('mj-dlg') as HTMLDialogElement).close());
$('mj-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await requestJobLine(askJob, {
      kind: askKind,
      productId: askKind === 'part' ? Number(($('mj-part') as HTMLSelectElement).value) : undefined,
      description: askKind === 'work' ? ($('mj-work') as HTMLInputElement).value : '',
      quantity: Number(($('mj-qty') as HTMLInputElement).value),
      note: ($('mj-note') as HTMLInputElement).value,
    });
    ($('mj-dlg') as HTMLDialogElement).close();
    await load();
  } catch (err) {
    $('mj-dlg-error').textContent = failure(err);
    $('mj-dlg-error').hidden = false;
  }
});

$('mj-refresh').addEventListener('click', () => void load());
void load();
