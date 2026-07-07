/**
 * Task Manager (Phase 3, Module 14). Simple CRUD over public.tasks, scoped
 * per-application when a task is created from an Application Workspace, or
 * standalone otherwise. No AI — this is a plain productivity list.
 */

import { supabase } from '../../lib/supabase';
import type { TaskKind, TaskPriority, TaskRow, TaskStatus } from '../types/phase3';
import { mapSupabaseError } from '../utils/errors';
import { sanitizeField, sanitizeProse } from '../utils/sanitize';

export async function listTasks(userId: string): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw mapSupabaseError(error, 'Loading tasks');
  return (data ?? []) as TaskRow[];
}

export async function createTask(
  userId: string,
  fields: {
    title: string;
    detail?: string;
    kind?: TaskKind;
    priority?: TaskPriority;
    dueAt?: string | null;
    applicationId?: string | null;
  }
): Promise<TaskRow> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      application_id: fields.applicationId ?? null,
      title: sanitizeField(fields.title, 200),
      detail: sanitizeProse(fields.detail ?? '', 2_000),
      kind: fields.kind ?? 'general',
      priority: fields.priority ?? 'medium',
      due_at: fields.dueAt ?? null,
    })
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Creating the task');
  return data as TaskRow;
}

export async function updateTask(userId: string, id: string, patch: Partial<TaskRow>): Promise<TaskRow> {
  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('user_id', userId)
    .eq('id', id)
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Updating the task');
  return data as TaskRow;
}

export async function completeTask(userId: string, id: string): Promise<TaskRow> {
  return updateTask(userId, id, { status: 'done' as TaskStatus, completed_at: new Date().toISOString() });
}

export async function dismissTask(userId: string, id: string): Promise<TaskRow> {
  return updateTask(userId, id, { status: 'dismissed' as TaskStatus });
}

export async function deleteTask(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('user_id', userId).eq('id', id);
  if (error) throw mapSupabaseError(error, 'Deleting the task');
}

/** Tasks due within `days` days (or overdue), open only — for reminders/automation. */
export function upcomingTasks(tasks: TaskRow[], days = 7, now: Date = new Date()): TaskRow[] {
  const horizon = now.getTime() + days * 86_400_000;
  return tasks.filter((t) => t.status === 'open' && t.due_at && new Date(t.due_at).getTime() <= horizon);
}

export function overdueTasks(tasks: TaskRow[], now: Date = new Date()): TaskRow[] {
  const cutoff = now.getTime();
  return tasks.filter((t) => t.status === 'open' && t.due_at && new Date(t.due_at).getTime() < cutoff);
}
