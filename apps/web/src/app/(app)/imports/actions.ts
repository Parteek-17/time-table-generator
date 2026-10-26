'use server';

import type { ImportJobDto, ImportRowDto } from '@slotwise/shared';
import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export interface ImportActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  message?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function call<T>(
  id: string,
  method: 'POST' | 'PUT',
  path: string,
  body?: unknown,
): Promise<ImportActionResult<T>> {
  if (!UUID.test(id)) return { ok: false, message: 'We could not find this import.' };
  const res = await api<T>(`/imports/${id}${path}`, { method, body });
  revalidatePath(`/imports/${id}`);
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true, data: res.data };
}

/** Template column → index of the file's column (null = not in the file). */
export async function saveMapping(id: string, mapping: Record<string, number | null>) {
  return call<ImportJobDto>(id, 'PUT', '/mapping', { mapping });
}

/** Inline fix of one row, and/or skip or include it. */
export async function editRow(
  id: string,
  rowNumber: number,
  edit: { data?: Record<string, string>; skip?: boolean },
) {
  if (!Number.isInteger(rowNumber) || rowNumber < 1) return { ok: false, message: 'Unknown row.' };
  return call<ImportRowDto>(id, 'PUT', `/rows/${rowNumber}`, edit);
}

export async function commitImport(id: string) {
  const res = await call<ImportJobDto>(id, 'POST', '/commit');
  // What was imported shows on the other setup pages.
  if (res.ok) revalidatePath('/', 'layout');
  return res;
}

export async function cancelImport(id: string) {
  return call<ImportJobDto>(id, 'POST', '/cancel');
}
