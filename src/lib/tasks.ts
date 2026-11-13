/**
 * Tasks handed to team members (/api/v1/tasks/). Everyone sees and moves
 * their own; seeing the whole team and assigning needs permission.
 */

import { api, apiDownload } from './api';

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high';
export type TaskRepeat = 'none' | 'daily' | 'weekly' | 'monthly';

export interface Person {
  id: number;
  name: string;
  position: string;
}

export interface TaskEvent {
  id: number;
  kind: 'created' | 'edited' | 'reassigned' | 'status' | 'comment';
  actorName: string;
  fromStatus: string;
  toStatus: string;
  note: string;
  createdAt: string;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  statusLabel: string;
  priority: TaskPriority;
  priorityLabel: string;
  dueDate: string | null;
  isOverdue: boolean;
  repeat: TaskRepeat;
  repeatLabel: string;
  attachmentCount: number;
  assignedTo: Person;
  assignedBy: Person;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  events: TaskEvent[];
}

export interface TaskCounts {
  open: number;
  overdue: number;
  doneThisWeek: number;
}

export interface TaskSummary {
  mine: TaskCounts;
  team: TaskCounts | null;
  people: Array<{ id: number; name: string; open: number; overdue: number; done: number }>;
}

export interface TaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string | null;
  repeat?: TaskRepeat;
  assignedTo: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toTask(r: any): Task {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    status: r.status,
    statusLabel: r.status_label,
    priority: r.priority,
    priorityLabel: r.priority_label,
    dueDate: r.due_date,
    isOverdue: Boolean(r.is_overdue),
    repeat: r.repeat ?? 'none',
    repeatLabel: r.repeat_label ?? '',
    attachmentCount: r.attachment_count ?? 0,
    assignedTo: r.assigned_to,
    assignedBy: r.assigned_by,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    events: (r.events ?? []).map((e: any) => ({
      id: e.id,
      kind: e.kind,
      actorName: e.actor_name,
      fromStatus: e.from_status,
      toStatus: e.to_status,
      note: e.note,
      createdAt: e.created_at,
    })),
  };
}

const counts = (c: any): TaskCounts => ({ open: c.open, overdue: c.overdue, doneThisWeek: c.done_this_week });

export async function listTasks(params: Record<string, string> = {}): Promise<Task[]> {
  const query = new URLSearchParams({ page_size: '100', ...params }).toString();
  const data = await api<any>(`/tasks/?${query}`);
  const rows = Array.isArray(data) ? data : data.results;

  return rows.map(toTask);
}

export async function getTask(id: number): Promise<Task> {
  return toTask(await api(`/tasks/${id}/`));
}

export async function createTask(input: TaskInput): Promise<Task> {
  return toTask(
    await api('/tasks/', {
      method: 'POST',
      body: {
        title: input.title,
        description: input.description ?? '',
        priority: input.priority ?? 'normal',
        due_date: input.dueDate || null,
        repeat: input.repeat ?? 'none',
        assigned_to: input.assignedTo,
      },
    }),
  );
}

export async function editTask(id: number, input: Partial<TaskInput>): Promise<Task> {
  const body: Record<string, unknown> = {};
  if (input.title !== undefined) body.title = input.title;
  if (input.description !== undefined) body.description = input.description;
  if (input.priority !== undefined) body.priority = input.priority;
  if (input.dueDate !== undefined) body.due_date = input.dueDate || null;
  if (input.repeat !== undefined) body.repeat = input.repeat;
  if (input.assignedTo !== undefined) body.assigned_to = input.assignedTo;

  return toTask(await api(`/tasks/${id}/`, { method: 'PATCH', body }));
}

export async function setTaskStatus(id: number, status: TaskStatus, note = ''): Promise<Task> {
  return toTask(await api(`/tasks/${id}/status/`, { method: 'POST', body: { status, note } }));
}

export async function commentOnTask(id: number, note: string): Promise<Task> {
  return toTask(await api(`/tasks/${id}/comment/`, { method: 'POST', body: { note } }));
}

export async function cancelTask(id: number, note = ''): Promise<Task> {
  return toTask(await api(`/tasks/${id}/cancel/`, { method: 'POST', body: { note } }));
}

export async function listAssignees(): Promise<Person[]> {
  return api<Person[]>('/tasks/assignees/');
}

export async function getTaskSummary(): Promise<TaskSummary> {
  const r = await api<any>('/tasks/summary/');

  return { mine: counts(r.mine), team: r.team ? counts(r.team) : null, people: r.people ?? [] };
}


export interface TaskFile {
  id: number;
  name: string;
  size: number;
  uploadedBy: string;
  createdAt: string;
}

const toFile = (r: any): TaskFile => ({
  id: r.id,
  name: r.original_name,
  size: r.size,
  uploadedBy: r.uploaded_by_name ?? '',
  createdAt: r.created_at,
});

export async function listTaskFiles(taskId: number): Promise<TaskFile[]> {
  return (await api<any[]>(`/tasks/${taskId}/attachments/`)).map(toFile);
}

export async function uploadTaskFile(taskId: number, file: File): Promise<TaskFile> {
  const form = new FormData();
  form.append('file', file);
  return toFile(await api(`/tasks/${taskId}/attachments/`, { method: 'POST', body: form }));
}

export function downloadTaskFile(taskId: number, file: TaskFile): Promise<void> {
  return apiDownload(`/tasks/${taskId}/attachments/${file.id}/`, file.name);
}

export async function deleteTaskFile(taskId: number, id: number): Promise<void> {
  await api(`/tasks/${taskId}/attachments/${id}/`, { method: 'DELETE' });
}
