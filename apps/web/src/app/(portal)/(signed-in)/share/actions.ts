'use server';

import { CreatePublicLinkBody } from '@slotwise/shared/portal';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

/** Makes (or finds) the public link for the chosen section or room ("section:<id>"). */
export async function createLink(form: FormData): Promise<void> {
  const [kind, targetId] = String(form.get('target') ?? '').split(':');
  const body = CreatePublicLinkBody.safeParse({ kind, targetId });
  if (body.success) await api('/portal/links', { method: 'POST', body: body.data });
  revalidatePath('/share');
}

/** Stops a link: its printed QR code then says the link doesn't work any more. */
export async function revokeLink(form: FormData): Promise<void> {
  const id = z.uuid().safeParse(form.get('id'));
  if (id.success) await api(`/portal/links/${id.data}`, { method: 'DELETE' });
  revalidatePath('/share');
}
