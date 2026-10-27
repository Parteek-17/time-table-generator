'use server';

import type {
  CreateExamInput,
  ExamPaperInput,
  ExamSessionInput,
  ExamSummaryDto,
  SeatingPlanDto,
} from '@slotwise/shared/exams';
import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export type ActionResult<T = null> =
  { ok: true; data: T } | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GONE = { ok: false as const, message: 'This no longer exists. Reload the page.' };

async function call<T>(
  path: string,
  init: { method: 'POST' | 'PUT' | 'DELETE'; body?: unknown },
  revalidate: string,
): Promise<ActionResult<T>> {
  const res = await api<T>(path, init);
  if (!res.ok) return { ok: false, message: res.message, fieldErrors: res.fieldErrors };
  revalidatePath(revalidate);
  return { ok: true, data: res.data };
}

export async function createExam(input: CreateExamInput): Promise<ActionResult<ExamSummaryDto>> {
  return call('/exams', { method: 'POST', body: input }, '/exams');
}

export async function removeExam(examId: string): Promise<ActionResult> {
  if (!UUID.test(examId)) return GONE;
  return call(`/exams/${examId}`, { method: 'DELETE' }, '/exams');
}

export async function addSession(
  examId: string,
  input: ExamSessionInput,
): Promise<ActionResult<{ id: string }>> {
  if (!UUID.test(examId)) return GONE;
  return call(`/exams/${examId}/sessions`, { method: 'POST', body: input }, `/exams/${examId}`);
}

export async function removeSession(examId: string, sessionId: string): Promise<ActionResult> {
  if (!UUID.test(examId) || !UUID.test(sessionId)) return GONE;
  return call(`/exams/sessions/${sessionId}`, { method: 'DELETE' }, `/exams/${examId}`);
}

export async function addPaper(
  examId: string,
  input: ExamPaperInput,
): Promise<ActionResult<{ id: string }>> {
  if (!UUID.test(examId)) return GONE;
  return call(`/exams/${examId}/papers`, { method: 'POST', body: input }, `/exams/${examId}`);
}

export async function removePaper(examId: string, paperId: string): Promise<ActionResult> {
  if (!UUID.test(examId) || !UUID.test(paperId)) return GONE;
  return call(`/exams/papers/${paperId}`, { method: 'DELETE' }, `/exams/${examId}`);
}

/** Starts building a seating plan (a background job) and returns the plan to follow. */
export async function buildSeating(
  sessionId: string,
  hallIds: string[],
): Promise<ActionResult<{ planId: string }>> {
  if (!UUID.test(sessionId)) return GONE;
  const res = await api<{ planId: string }>(`/exams/sessions/${sessionId}/seating`, {
    method: 'POST',
    body: { hallIds },
  });
  return res.ok ? { ok: true, data: res.data } : { ok: false, message: res.message };
}

/** The plan's progress, for polling while it is being built. */
export async function planStatus(planId: string): Promise<ActionResult<SeatingPlanDto>> {
  if (!UUID.test(planId)) return GONE;
  const res = await api<SeatingPlanDto>(`/exams/seating/${planId}`);
  return res.ok ? { ok: true, data: res.data } : { ok: false, message: res.message };
}

export async function publishPlan(
  planId: string,
  path: string,
): Promise<ActionResult<SeatingPlanDto>> {
  if (!UUID.test(planId)) return GONE;
  return call(`/exams/seating/${planId}/publish`, { method: 'POST' }, path);
}

export async function setUnavailable(
  sessionId: string,
  facultyIds: string[],
  path: string,
): Promise<ActionResult> {
  if (!UUID.test(sessionId)) return GONE;
  return call(
    `/exams/sessions/${sessionId}/unavailable`,
    { method: 'PUT', body: { facultyIds } },
    path,
  );
}
