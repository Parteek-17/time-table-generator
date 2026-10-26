'use server';

import type {
  EditInput,
  EditResult,
  GenerateTimetableInput,
  GridBell,
  PublishResult,
  SolveJobDto,
  UndoPublishResult,
  ViewKind,
  ViewSlot,
} from '@slotwise/shared/timetable';
import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';
import { viewOf } from './data';

export type JobResult = { ok: true; job: SolveJobDto } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Starts generating (a background job on the API) and returns the job to follow. */
export async function startGenerate(
  termId: string,
  input: Partial<GenerateTimetableInput>,
): Promise<JobResult> {
  if (!UUID.test(termId)) return { ok: false, message: 'Pick a term first.' };
  const res = await api<SolveJobDto>(`/terms/${termId}/timetable/generate`, {
    method: 'POST',
    body: input,
  });
  return res.ok ? { ok: true, job: res.data } : { ok: false, message: res.message };
}

/** The job's progress; once it has finished, the timetable list shows the new draft. */
export async function jobStatus(jobId: string): Promise<JobResult> {
  if (!UUID.test(jobId)) return { ok: false, message: 'This run does not exist.' };
  const res = await api<SolveJobDto>(`/timetable/jobs/${jobId}`);
  if (!res.ok) return { ok: false, message: res.message };
  if (res.data.status === 'succeeded') revalidatePath('/timetable');
  return { ok: true, job: res.data };
}

export type EditActionResult = { ok: true; result: EditResult } | { ok: false; message: string };

/** One move or lock on a draft. The API checks it again with the same checker. */
export async function editSlot(versionId: string, input: EditInput): Promise<EditActionResult> {
  if (!UUID.test(versionId)) return { ok: false, message: 'This timetable does not exist.' };
  const res = await api<EditResult>(`/timetable/versions/${versionId}/edits`, {
    method: 'POST',
    body: input,
  });
  return res.ok ? { ok: true, result: res.data } : { ok: false, message: res.message };
}

/** An editable draft copy of a version; the page then opens it. */
export async function copyVersion(
  versionId: string,
): Promise<{ ok: true; versionId: string } | { ok: false; message: string }> {
  if (!UUID.test(versionId)) return { ok: false, message: 'This timetable does not exist.' };
  const res = await api<{ versionId: string }>(`/timetable/versions/${versionId}/copy`, {
    method: 'POST',
  });
  if (!res.ok) return { ok: false, message: res.message };
  revalidatePath('/timetable');
  return { ok: true, versionId: res.data.versionId };
}

export type PublishActionResult =
  { ok: true; result: PublishResult } | { ok: false; message: string };

/** Publishes a draft; the version it replaces is archived. No confirm: the page offers Undo. */
export async function publishVersion(versionId: string): Promise<PublishActionResult> {
  if (!UUID.test(versionId)) return { ok: false, message: 'This timetable does not exist.' };
  const res = await api<PublishResult>(`/timetable/versions/${versionId}/publish`, {
    method: 'POST',
  });
  if (!res.ok) return { ok: false, message: res.message };
  revalidatePath('/timetable');
  return { ok: true, result: res.data };
}

export type UndoPublishActionResult =
  { ok: true; result: UndoPublishResult } | { ok: false; message: string };

/** Puts the previous version back; the undone classes come back as a new draft. */
export async function undoPublish(versionId: string): Promise<UndoPublishActionResult> {
  if (!UUID.test(versionId)) return { ok: false, message: 'This timetable does not exist.' };
  const res = await api<UndoPublishResult>(`/timetable/versions/${versionId}/undo-publish`, {
    method: 'POST',
  });
  if (!res.ok) return { ok: false, message: res.message };
  revalidatePath('/timetable');
  return { ok: true, result: res.data };
}

/** The week as saved now (a draft may have changed since the page loaded), for Copy as CSV. */
export async function freshWeek(
  versionId: string,
  kind: ViewKind,
  id: string,
): Promise<{ ok: true; bell: GridBell; slots: ViewSlot[] } | { ok: false; message: string }> {
  if (!UUID.test(versionId)) return { ok: false, message: 'This timetable does not exist.' };
  const res = await viewOf(versionId, kind, id);
  return res.ok
    ? { ok: true, bell: res.data.bell, slots: res.data.slots }
    : { ok: false, message: res.message };
}
