import { IMPORT_KINDS, IMPORT_MAX_BYTES, type ImportJobDto } from '@slotwise/shared';
import { revalidatePath } from 'next/cache';
import { uploadToApi } from '../upload.server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Upload form target (a route handler, because server actions accept at most 1 MB).
 * Answers { ok, data } or { ok: false, message } in plain words.
 */
export async function POST(req: Request) {
  const fail = (message: string, status = 400) => Response.json({ ok: false, message }, { status });
  const form = await req.formData().catch(() => null);
  if (!form) return fail('Choose a file.');
  const kind = String(form.get('kind') ?? '');
  const termId = String(form.get('termId') ?? '');
  const file = form.get('file');
  if (!(IMPORT_KINDS as readonly string[]).includes(kind)) {
    return fail('Choose what you are importing.');
  }
  if (!(file instanceof File) || file.size === 0) return fail('Choose a file.');
  if (file.size > IMPORT_MAX_BYTES) return fail('The file is too big. Keep it under 5 MB.');
  const query = new URLSearchParams({ kind, fileName: file.name });
  if (UUID.test(termId)) query.set('termId', termId);
  const res = await uploadToApi<ImportJobDto>(`/imports?${query.toString()}`, file);
  if (!res.ok) return fail(res.message, res.status);
  revalidatePath('/imports');
  return Response.json({ ok: true, data: res.data });
}
