'use server';

import type { GenerateTimetableInput, SolveJobDto } from '@slotwise/shared/timetable';
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
