'use server';

import type { PromotePreviewDto } from '@slotwise/shared';
import { api } from '@/lib/api';
import type { ActionResult } from '@/lib/entity-actions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Read-only: what "Promote batches" would do. */
export async function previewPromoteAction(
  fromTermId: string,
  toTermId: string,
): Promise<ActionResult<PromotePreviewDto>> {
  if (!UUID.test(fromTermId) || !UUID.test(toTermId)) return { ok: false, message: 'Pick a term.' };
  const res = await api<PromotePreviewDto>(
    `/terms/${fromTermId}/promote?toTermId=${encodeURIComponent(toTermId)}`,
  );
  return res.ok ? { ok: true, data: res.data } : { ok: false, message: res.message };
}
