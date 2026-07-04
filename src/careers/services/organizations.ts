/**
 * Organization Management foundation (Phase 4, Module 12 — minimal slice
 * needed by Module 1's Enterprise plan and the Admin Dashboard's
 * Organizations view). Full University/Recruiter portals build on this in
 * a later pass.
 */

import { supabase } from '../../lib/supabase';
import { mapSupabaseError } from '../utils/errors';
import { sanitizeField } from '../utils/sanitize';
import type { OrganizationKind, OrganizationMemberRow, OrganizationRow, OrgMemberRole } from '../types/phase4';

export async function listMyOrganizations(userId: string): Promise<OrganizationRow[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*, organization_members!inner(user_id)')
    .or(`owner_user_id.eq.${userId},organization_members.user_id.eq.${userId}`);
  if (error) throw mapSupabaseError(error, 'Loading organizations');
  return (data ?? []) as OrganizationRow[];
}

export async function createOrganization(userId: string, name: string, kind: OrganizationKind): Promise<OrganizationRow> {
  const { data, error } = await supabase
    .from('organizations')
    .insert({ name: sanitizeField(name, 200), kind, owner_user_id: userId })
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Creating the organization');
  // Owner is implicitly a member with the 'owner' role.
  await supabase.from('organization_members').insert({ org_id: (data as OrganizationRow).id, user_id: userId, role: 'owner' });
  return data as OrganizationRow;
}

export async function listMembers(orgId: string): Promise<OrganizationMemberRow[]> {
  const { data, error } = await supabase.from('organization_members').select('*').eq('org_id', orgId).order('joined_at');
  if (error) throw mapSupabaseError(error, 'Loading members');
  return (data ?? []) as OrganizationMemberRow[];
}

export async function inviteMember(orgId: string, userId: string, invitedBy: string, role: OrgMemberRole = 'member'): Promise<void> {
  const { error } = await supabase.from('organization_members').insert({ org_id: orgId, user_id: userId, role, invited_by: invitedBy });
  if (error) throw mapSupabaseError(error, 'Inviting the member');
}

export async function removeMember(orgId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('organization_members').delete().eq('org_id', orgId).eq('user_id', userId);
  if (error) throw mapSupabaseError(error, 'Removing the member');
}

/** Admin-only: every organization on the platform (RLS enforces the check). */
export async function listAllOrganizations(): Promise<OrganizationRow[]> {
  const { data, error } = await supabase.from('organizations').select('*').order('created_at', { ascending: false });
  if (error) throw mapSupabaseError(error, 'Loading organizations');
  return (data ?? []) as OrganizationRow[];
}
