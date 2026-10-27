'use server';

import type {
  BookMakeUpInput,
  CreateDisruptionInputRaw,
  CreateDisruptionResult,
  MakeUpDto,
  MakeUpOptionsDto,
  UndoDisruptionResult,
} from '@slotwise/shared/reschedule';
import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

type Failed = { ok: false; message: string; fieldErrors?: Record<string, string[]> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const missing: Failed = { ok: false, message: 'This no longer exists. Reload the page.' };

/** Adds a holiday, event or leave; its classes are cancelled at once. The page offers Undo. */
export async function addDisruption(
  termId: string,
  input: CreateDisruptionInputRaw,
): Promise<{ ok: true; result: CreateDisruptionResult } | Failed> {
  if (!UUID.test(termId)) return { ok: false, message: 'Pick a term first.' };
  const res = await api<CreateDisruptionResult>(`/terms/${termId}/disruptions`, {
    method: 'POST',
    body: input,
  });
  if (!res.ok) return { ok: false, message: res.message, fieldErrors: res.fieldErrors };
  revalidatePath('/reschedule');
  return { ok: true, result: res.data };
}

/** Undo: the classes come back (unless another holiday or event still covers them). */
export async function undoDisruption(
  disruptionId: string,
): Promise<{ ok: true; result: UndoDisruptionResult } | Failed> {
  if (!UUID.test(disruptionId)) return missing;
  const res = await api<UndoDisruptionResult>(`/disruptions/${disruptionId}`, {
    method: 'DELETE',
  });
  if (!res.ok) return { ok: false, message: res.message };
  revalidatePath('/reschedule');
  return { ok: true, result: res.data };
}

export async function makeUpOptions(
  cancellationId: string,
): Promise<{ ok: true; result: MakeUpOptionsDto } | Failed> {
  if (!UUID.test(cancellationId)) return missing;
  const res = await api<MakeUpOptionsDto>(`/cancellations/${cancellationId}/make-up-options`);
  return res.ok ? { ok: true, result: res.data } : { ok: false, message: res.message };
}

/** Books (or moves) the make-up; the API checks the choice again. */
export async function bookMakeUp(
  cancellationId: string,
  input: BookMakeUpInput,
): Promise<{ ok: true; result: MakeUpDto } | Failed> {
  if (!UUID.test(cancellationId)) return missing;
  const res = await api<MakeUpDto>(`/cancellations/${cancellationId}/make-up`, {
    method: 'POST',
    body: input,
  });
  if (!res.ok) return { ok: false, message: res.message };
  revalidatePath('/reschedule');
  return { ok: true, result: res.data };
}

export async function removeMakeUp(makeUpId: string): Promise<{ ok: true } | Failed> {
  if (!UUID.test(makeUpId)) return missing;
  const res = await api<{ removed: true }>(`/make-ups/${makeUpId}`, { method: 'DELETE' });
  if (!res.ok) return { ok: false, message: res.message };
  revalidatePath('/reschedule');
  return { ok: true };
}
