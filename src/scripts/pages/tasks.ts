import { can, getSession } from '../../lib/auth';
import {
  cancelTask, commentOnTask, deleteTaskFile, downloadTaskFile, listTaskFiles, uploadTaskFile, createTask, editTask, getTask, getTaskSummary, listAssignees, listTasks, setTaskStatus,
  type Person, type Task, type TaskFile, type TaskRepeat, type TaskStatus, type TaskSummary,
} from '../../lib/tasks';

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const session = getSession();
if (!session) window.location.replace('/');

const readOnly = session?.accessMode === 'read_only';
const canAssign = !readOnly && can(session, 'tasks.create');
const canSeeAll = can(session, 'tasks.view');
const canEdit = !readOnly && can(session, 'tasks.update');
const canCancel = !readOnly && can(session, 'tasks.delete');
const me = Number((session as unknown as { userId?: number; id?: number })?.userId ?? (session as unknown as { id?: number })?.id ?? 0);

type Tab = 'mine' | 'by-me' | 'team';
// The owner has no tasks of their own: they hand work out and watch the team.
const ownerView = session?.isOwner === true;
let tab: Tab = ownerView ? 'team' : 'mine';
let personFilter: number | null = null;
let tasks: Task[] = [];
let summary: TaskSummary | null = null;
let people: Person[] = [];
let openId: number | null = null;
let editing: Task | null = null;

const STATUS_TEXT: Record<string, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done', cancelled: 'Cancelled' };
const message = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Something went wrong. Please try again.');
const when = (iso: string) => new Date(iso).toLocaleString();

function notice(text: string | null): void {
  const el = $('tk-notice');
  el.textContent = text ?? '';
  el.hidden = !text;
}

function params(): Record<string, string> {
  const p: Record<string, string> = {};
  const status = ($('tk-status') as HTMLSelectElement).value;
  if (status === 'open') p.status = 'todo,in_progress';
  else if (status !== 'all') p.status = status;
  if (tab === 'mine') p.mine = 'true';
  if (tab === 'by-me') p.assigned_by_me = 'true';
  if (tab === 'team' && personFilter) p.assigned_to = String(personFilter);
  return p;
}

function renderTable(): void {
  const forMe = tab === 'mine';
  $('tk-th-person').textContent = forMe ? 'Assigned by' : 'Assigned to';
  $('tk-count').textContent = `${tasks.length} task${tasks.length === 1 ? '' : 's'}`;
  $('tk-tbody').innerHTML = tasks.length
    ? tasks
        .map((t) => {
          const who = forMe ? t.assignedBy : t.assignedTo;
          const due = t.dueDate ? `<span class="${t.isOverdue ? 'tk-late' : ''}">${esc(t.dueDate)}${t.isOverdue ? ' (overdue)' : ''}</span>` : '—';
          const prio = t.priority === 'high' ? '<span class="tk-prio-high">HIGH</span>' : '';
          return `<tr class="tk-row" data-id="${t.id}"><td>${esc(t.title)}${prio}</td><td>${esc(who.name)}<span class="tk-sub">${esc(who.position)}</span></td><td>${due}</td><td><span class="tk-pill ${t.status}">${esc(t.statusLabel)}</span></td><td><button type="button" class="btn-ghost-sm">Open</button></td></tr>`;
        })
        .join('')
    : `<tr><td colspan="5" class="pu-empty">${tab === 'mine' ? 'No tasks for you here.' : 'Nothing here.'}</td></tr>`;
  document.querySelectorAll<HTMLElement>('.tk-row').forEach((row) => row.addEventListener('click', () => void openTask(Number(row.dataset.id))));
}

function renderSummary(): void {
  if (!summary) return;
  $('tk-k-open').textContent = String(summary.mine.open);
  $('tk-k-over').textContent = String(summary.mine.overdue);
  $('tk-k-done').textContent = String(summary.mine.doneThisWeek);
  if (summary.team) {
    $('tk-k-team').hidden = false;
    $('tk-k-topen').textContent = String(summary.team.open);
    $('tk-k-tsub').textContent = `${summary.team.overdue} overdue`;
  }
  for (const id of ['tk-k-open', 'tk-k-over', 'tk-k-done']) {
    const kpi = $(id).closest<HTMLElement>('.pd-kpi');
    if (kpi) kpi.hidden = ownerView;
  }
  const card = $('tk-people-card');
  card.hidden = !(tab === 'team' && summary.team);
  $('tk-people').innerHTML = summary.people
    .map((p) => `<tr class="tk-row" data-person="${p.id}"><td>${esc(p.name)}${personFilter === p.id ? ' •' : ''}</td><td class="num">${p.open}</td><td class="num${p.overdue ? ' tk-late' : ''}">${p.overdue}</td><td class="num">${p.done}</td></tr>`)
    .join('');
  document.querySelectorAll<HTMLElement>('[data-person]').forEach((row) =>
    row.addEventListener('click', () => {
      const id = Number(row.dataset.person);
      personFilter = personFilter === id ? null : id;
      void load();
    }),
  );
}

async function load(): Promise<void> {
  try {
    [tasks, summary] = await Promise.all([listTasks(params()), getTaskSummary()]);
    notice(readOnly ? 'Read-only: you are viewing this business from the company owner account.' : null);
  } catch (e) {
    tasks = [];
    notice(message(e));
  }
  renderSummary();
  renderTable();
}

// ---- detail -------------------------------------------------------------
function eventText(e: Task['events'][number]): string {
  if (e.kind === 'status') return `Status: ${STATUS_TEXT[e.fromStatus] ?? e.fromStatus} → ${STATUS_TEXT[e.toStatus] ?? e.toStatus}${e.note ? ` — ${e.note}` : ''}`;
  if (e.kind === 'comment') return `“${e.note}”`;
  return e.note || e.kind;
}

function paintDetail(t: Task): void {
  openId = t.id;
  $('td-title').innerHTML = `${esc(t.title)} <span class="tk-pill ${t.status}">${esc(t.statusLabel)}</span>`;
  $('td-meta').textContent = `For ${t.assignedTo.name} · from ${t.assignedBy.name} · ${t.dueDate ? `due ${t.dueDate}${t.isOverdue ? ' (overdue)' : ''}` : 'no due date'} · ${t.priorityLabel} priority${t.repeat !== 'none' ? ` · ${t.repeatLabel.toLowerCase()}` : ''}`;
  $('td-desc').textContent = t.description;
  $('td-desc').hidden = !t.description;
  const mine = t.assignedTo.id === me;
  const live = t.status === 'todo' || t.status === 'in_progress';
  const buttons: string[] = [];
  if (!readOnly && (mine || canEdit) && live) {
    if (t.status === 'todo') buttons.push('<button type="button" class="btn-ghost-sm" data-do="in_progress">Start</button>');
    buttons.push('<button type="button" class="btn-primary-sm" data-do="done">Mark done</button>');
  }
  if (!readOnly && (mine || canEdit) && t.status === 'done') buttons.push('<button type="button" class="btn-ghost-sm" data-do="in_progress">Reopen</button>');
  if (canEdit && t.status !== 'cancelled') buttons.push('<button type="button" class="btn-ghost-sm" data-do="edit">Edit / reassign</button>');
  if (canCancel && live) buttons.push('<button type="button" class="btn-ghost-sm" data-do="cancel">Cancel task</button>');
  $('td-actions').innerHTML = buttons.join('');
  $('td-note-wrap').hidden = !buttons.some((b) => b.includes('data-do="done"') || b.includes('cancel'));
  ($('td-note') as HTMLInputElement).value = '';
  $('td-events').innerHTML = t.events
    .map((e) => `<li class="td-event">${esc(eventText(e))}<small>${esc(e.actorName)} · ${esc(when(e.createdAt))}</small></li>`)
    .join('');
  void paintFiles(t);
  $('td-actions').querySelectorAll<HTMLButtonElement>('[data-do]').forEach((b) => b.addEventListener('click', () => void act(t, b.dataset.do!)));
}

// ---- files on a task ----------------------------------------------------
let files: TaskFile[] = [];
const sizeText = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

async function paintFiles(t: Task): Promise<void> {
  const involved = t.assignedTo.id === me || t.assignedBy.id === me || canEdit;
  $('td-upload').hidden = readOnly || !involved || t.status === 'cancelled';
  try {
    files = await listTaskFiles(t.id);
  } catch {
    files = [];
  }
  $('td-files').innerHTML = files.length
    ? files
        .map((f) => `<li><span>${esc(f.name)} <small class="tk-sub" style="display:inline">${sizeText(f.size)} · ${esc(f.uploadedBy)}</small></span><span><button type="button" class="btn-ghost-sm" data-file-get="${f.id}">Download</button>${readOnly ? '' : ` <button type="button" class="btn-ghost-sm" data-file-del="${f.id}">Remove</button>`}</span></li>`)
        .join('')
    : '<li class="tk-sub">No files yet.</li>';
}

$('td-files').addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;
  const get = target.closest<HTMLElement>('[data-file-get]');
  const del = target.closest<HTMLElement>('[data-file-del]');
  if (openId === null) return;
  $('td-error').hidden = true;
  try {
    if (get) {
      const f = files.find((x) => x.id === Number(get.dataset.fileGet));
      if (f) await downloadTaskFile(openId, f);
    } else if (del) {
      const f = files.find((x) => x.id === Number(del.dataset.fileDel));
      if (f && confirm(`Remove "${f.name}"?`)) {
        await deleteTaskFile(openId, f.id);
        paintDetail(await getTask(openId));
      }
    }
  } catch (err) {
    $('td-error').textContent = message(err);
    $('td-error').hidden = false;
  }
});

$('td-attach').addEventListener('click', async () => {
  const input = $('td-file') as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || openId === null) return;
  $('td-error').hidden = true;
  try {
    await uploadTaskFile(openId, file);
    input.value = '';
    paintDetail(await getTask(openId));
  } catch (err) {
    $('td-error').textContent = message(err);
    $('td-error').hidden = false;
  }
});

async function openTask(id: number): Promise<void> {
  try {
    const t = await getTask(id);
    $('td-error').hidden = true;
    paintDetail(t);
    const dlg = $('tk-dlg') as HTMLDialogElement;
    if (!dlg.open) dlg.showModal();
  } catch (e) {
    notice(message(e));
  }
}

async function act(t: Task, what: string): Promise<void> {
  const err = $('td-error');
  err.hidden = true;
  const note = ($('td-note') as HTMLInputElement).value.trim();
  try {
    let updated: Task;
    if (what === 'edit') {
      openForm(t);
      return;
    }
    if (what === 'cancel') updated = await cancelTask(t.id, note);
    else updated = await setTaskStatus(t.id, what as TaskStatus, what === 'done' ? note : '');
    paintDetail(updated);
    void load();
  } catch (e) {
    err.textContent = message(e);
    err.hidden = false;
  }
}

$('td-send').addEventListener('click', async () => {
  const input = $('td-comment') as HTMLInputElement;
  const text = input.value.trim();
  if (!text || openId === null) return;
  try {
    paintDetail(await commentOnTask(openId, text));
    input.value = '';
  } catch (e) {
    $('td-error').textContent = message(e);
    $('td-error').hidden = false;
  }
});
$('td-close').addEventListener('click', () => ($('tk-dlg') as HTMLDialogElement).close());

// ---- assign / edit ------------------------------------------------------
async function openForm(task: Task | null): Promise<void> {
  editing = task;
  $('tf-error').hidden = true;
  $('tk-form-title').textContent = task ? 'Edit task' : 'Assign a task';
  $('tf-save').textContent = task ? 'Save' : 'Assign';
  try {
    if (!people.length) people = await listAssignees();
  } catch {
    people = [];
  }
  ($('tf-who') as HTMLSelectElement).innerHTML = people.length
    ? people.map((p) => `<option value="${p.id}">${esc(p.name)}${p.position ? ` — ${esc(p.position)}` : ''}</option>`).join('')
    : '<option value="">No staff to assign to yet</option>';
  ($('tf-title') as HTMLInputElement).value = task?.title ?? '';
  ($('tf-desc') as HTMLTextAreaElement).value = task?.description ?? '';
  ($('tf-due') as HTMLInputElement).value = task?.dueDate ?? '';
  ($('tf-priority') as HTMLSelectElement).value = task?.priority ?? 'normal';
  ($('tf-repeat') as HTMLSelectElement).value = task?.repeat ?? 'none';
  if (task) ($('tf-who') as HTMLSelectElement).value = String(task.assignedTo.id);
  const dlg = $('tk-form-dlg') as HTMLDialogElement;
  if (!dlg.open) dlg.showModal();
}

$('tk-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const err = $('tf-error');
  err.hidden = true;
  const whoValue = ($('tf-who') as HTMLSelectElement).value;
  if (!whoValue) {
    err.textContent = 'Choose who to assign it to.';
    err.hidden = false;
    return;
  }
  const input = {
    title: ($('tf-title') as HTMLInputElement).value.trim(),
    description: ($('tf-desc') as HTMLTextAreaElement).value.trim(),
    dueDate: ($('tf-due') as HTMLInputElement).value || null,
    priority: ($('tf-priority') as HTMLSelectElement).value as 'low' | 'normal' | 'high',
    repeat: ($('tf-repeat') as HTMLSelectElement).value as TaskRepeat,
    assignedTo: Number(whoValue),
  };
  if (input.repeat !== 'none' && !input.dueDate) {
    err.textContent = 'Set a due date for a repeating task.';
    err.hidden = false;
    return;
  }
  const btn = $('tf-save') as HTMLButtonElement;
  btn.disabled = true;
  try {
    const saved = editing ? await editTask(editing.id, input) : await createTask(input);
    ($('tk-form-dlg') as HTMLDialogElement).close();
    await load();
    if (editing) paintDetail(saved);
  } catch (e) {
    err.textContent = message(e);
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});
$('tf-cancel').addEventListener('click', () => ($('tk-form-dlg') as HTMLDialogElement).close());

// ---- wiring -------------------------------------------------------------
document.querySelectorAll<HTMLElement>('.tk-tab').forEach((el) =>
  el.addEventListener('click', () => {
    tab = el.dataset.tab as Tab;
    personFilter = null;
    document.querySelectorAll('.tk-tab').forEach((x) => x.classList.toggle('is-active', x === el));
    void load();
  }),
);
$('tk-status').addEventListener('change', () => void load());
$('tk-refresh').addEventListener('click', () => void load());
$('tk-new').addEventListener('click', () => void openForm(null));

$('tk-new').hidden = !canAssign;
document.querySelector<HTMLElement>('[data-tab="by-me"]')!.hidden = !canAssign;
document.querySelector<HTMLElement>('[data-tab="team"]')!.hidden = !canSeeAll;
if (ownerView) {
  document.querySelector<HTMLElement>('[data-tab="mine"]')!.hidden = true;
  document.querySelector<HTMLElement>('[data-tab="team"]')!.classList.add('is-active');
  document.querySelector<HTMLElement>('[data-tab="mine"]')!.classList.remove('is-active');
  $('tk-sub').textContent = 'Assign work to your staff and see how each task is going.';
} else if (canSeeAll) $('tk-sub').textContent = 'Work handed to you, and (under Everyone) what the whole team is doing.';

void load().then(() => {
  const id = Number(new URLSearchParams(window.location.search).get('id'));
  if (id) void openTask(id);
});
