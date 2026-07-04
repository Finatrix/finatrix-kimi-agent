/** Support Tickets (Phase 4, Module 4 — admin support queue). */

import { supabase } from '../../lib/supabase';
import { mapSupabaseError } from '../utils/errors';
import { sanitizeField, sanitizeProse } from '../utils/sanitize';
import type { SupportTicketMessageRow, SupportTicketRow, TicketPriority, TicketStatus } from '../types/phase4';

export async function listMyTickets(userId: string): Promise<SupportTicketRow[]> {
  const { data, error } = await supabase.from('support_tickets').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw mapSupabaseError(error, 'Loading your tickets');
  return (data ?? []) as SupportTicketRow[];
}

/** Admin-only: every open ticket on the platform (RLS enforces the check). */
export async function listAllTickets(): Promise<SupportTicketRow[]> {
  const { data, error } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false });
  if (error) throw mapSupabaseError(error, 'Loading tickets');
  return (data ?? []) as SupportTicketRow[];
}

export async function createTicket(userId: string, subject: string, body: string, priority: TicketPriority = 'medium'): Promise<SupportTicketRow> {
  const { data, error } = await supabase
    .from('support_tickets')
    .insert({ user_id: userId, subject: sanitizeField(subject, 200), body: sanitizeProse(body, 4_000), priority })
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Opening the ticket');
  return data as SupportTicketRow;
}

export async function setTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
  const { error } = await supabase.from('support_tickets').update({ status }).eq('id', ticketId);
  if (error) throw mapSupabaseError(error, 'Updating the ticket');
}

export async function listMessages(ticketId: string): Promise<SupportTicketMessageRow[]> {
  const { data, error } = await supabase.from('support_ticket_messages').select('*').eq('ticket_id', ticketId).order('created_at');
  if (error) throw mapSupabaseError(error, 'Loading messages');
  return (data ?? []) as SupportTicketMessageRow[];
}

export async function postMessage(ticketId: string, authorId: string, body: string, isStaff: boolean): Promise<void> {
  const { error } = await supabase.from('support_ticket_messages').insert({
    ticket_id: ticketId, author_id: authorId, is_staff: isStaff, body: sanitizeProse(body, 4_000),
  });
  if (error) throw mapSupabaseError(error, 'Sending the message');
}
