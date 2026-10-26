'use server';

import type {
  EditInput,
  EditResult,
  GenerateTimetableInput,
  SolveJobDto,
} from '@slotwise/shared/timetable';
import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

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
