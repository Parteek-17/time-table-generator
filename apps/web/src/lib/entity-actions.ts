'use server';

import { revalidatePath } from 'next/cache';
import { api } from './api';

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * Only master-data routes may be called through these generic actions:
 * /<resource>[/<id>][/<action>] with lowercase names and uuid ids. The API still checks
 * permissions on every call; this just keeps the actions from being a general proxy.
 */
const ALLOWED =
  /^\/(?:[a-z-]+)(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?(?:\/[a-z-]+){0,2}$/;

async function call<T>(
  method: 'POST' | 'PUT',
  path: string,
  body: unknown,
  revalidate: string,
): Promise<ActionResult<T>> {
  if (!ALLOWED.test(path)) return { ok: false, message: 'This action is not allowed.' };
  const res = await api<T>(path, { method, body });
  if (!res.ok) return { ok: false, message: res.message, fieldErrors: res.fieldErrors };
  revalidatePath(revalidate, 'layout');
  return { ok: true, data: res.data };
}

/** Create (no id) or update (whole object) a row. */
export async function saveEntity<T>(
  path: string,
  id: string | null,
  body: unknown,
  revalidate: string,
): Promise<ActionResult<T>> {
  return call<T>(id ? 'PUT' : 'POST', id ? `${path}/${id}` : path, body, revalidate);
}

export async function archiveEntity(
  path: string,
  id: string,
  revalidate: string,
): Promise<ActionResult> {
  return call('POST', `${path}/${id}/archive`, undefined, revalidate);
}

export async function restoreEntity(
  path: string,
  id: string,
  revalidate: string,
): Promise<ActionResult> {
  return call('POST', `${path}/${id}/restore`, undefined, revalidate);
}

/** Any other POST/PUT to a master-data route (generate cohorts, paste holidays, promote …). */
export async function sendToApi<T>(
  method: 'POST' | 'PUT',
  path: string,
  body: unknown,
  revalidate: string,
): Promise<ActionResult<T>> {
  return call<T>(method, path, body, revalidate);
}
