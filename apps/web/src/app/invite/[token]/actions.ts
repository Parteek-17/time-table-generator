'use server';

import type { MembershipDto } from '@slotwise/shared';
import { redirect } from 'next/navigation';
import { api } from '@/lib/api';

export async function acceptInviteAction(
  _prev: { error?: string },
  form: FormData,
): Promise<{ error?: string }> {
  const token = String(form.get('token') ?? '');
  const res = await api<MembershipDto>(`/invites/token/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
  });
  if (!res.ok) return { error: res.message };
  redirect('/?joined=1');
}
