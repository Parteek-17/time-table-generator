'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

/** "Make a new link": the old calendar address stops working. */
export async function resetFeed(): Promise<void> {
  await api('/portal/feed/reset', { method: 'POST' });
  revalidatePath('/calendar');
}
