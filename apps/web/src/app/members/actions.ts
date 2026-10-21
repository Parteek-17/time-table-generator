'use server';

import type { CreateInviteResponse } from '@slotwise/shared';
import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export interface InviteFormState {
  status: 'idle' | 'sent' | 'saved-no-email' | 'error';
  message?: string;
  email?: string;
  acceptUrl?: string;
  fieldErrors?: Record<string, string[]>;
}

export async function inviteAction(
  _prev: InviteFormState,
  form: FormData,
): Promise<InviteFormState> {
  const where = String(form.get('where') ?? '');
  const body = {
    email: String(form.get('email') ?? ''),
    role: String(form.get('role') ?? ''),
    scopeType: where === 'institute' ? 'institute' : 'department',
    departmentId: where === 'institute' || where === '' ? undefined : where,
  };
  const res = await api<CreateInviteResponse>('/invites', { method: 'POST', body });
  if (!res.ok) {
    return {
      status: 'error',
      message: res.message,
      fieldErrors: res.fieldErrors,
      email: body.email,
    };
  }
  revalidatePath('/members');
  return {
    status: res.data.emailSent ? 'sent' : 'saved-no-email',
    email: res.data.invite.email,
    acceptUrl: res.data.acceptUrl,
  };
}

export interface ActionResult {
  ok: boolean;
  message?: string;
}

async function mutate(path: string, method: 'POST' | 'DELETE'): Promise<ActionResult> {
  const res = await api<void>(path, { method });
  if (!res.ok) return { ok: false, message: res.message };
  revalidatePath('/members');
  return { ok: true };
}

export async function revokeMembershipAction(membershipId: string): Promise<ActionResult> {
  return mutate(`/members/${encodeURIComponent(membershipId)}`, 'DELETE');
}

export async function restoreMembershipAction(membershipId: string): Promise<ActionResult> {
  return mutate(`/members/${encodeURIComponent(membershipId)}/restore`, 'POST');
}

export async function cancelInviteAction(inviteId: string): Promise<ActionResult> {
  return mutate(`/invites/${encodeURIComponent(inviteId)}`, 'DELETE');
}
