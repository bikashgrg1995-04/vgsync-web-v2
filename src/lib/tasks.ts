/**
 * Tasks handed to team members (/api/v1/tasks/). Everyone sees and moves
 * their own; seeing the whole team and assigning needs permission.
 */

import { api } from './api';

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high';

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
