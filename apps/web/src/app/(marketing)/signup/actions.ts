'use server';

import type { SignupResponse } from '@slotwise/shared/platform';
import { api } from '@/lib/api';

export interface SignupFormState {
  status: 'idle' | 'done' | 'error';
  message?: string;
  fieldErrors?: Record<string, string[]>;
  result?: SignupResponse;
  /** What was typed, so a refused form keeps it. */
  values?: Record<string, string>;
}

const FIELDS = [
  'instituteName',
  'slug',
  'type',
  'affiliatingUniversityName',
  'adminName',
  'adminEmail',
  'website',
] as const;

export async function signupAction(
  _prev: SignupFormState,
  form: FormData,
): Promise<SignupFormState> {
  const values = Object.fromEntries(FIELDS.map((f) => [f, String(form.get(f) ?? '')]));
  // The API validates with signupSchema; an empty honeypot is left out.
  const body = { ...values, website: values.website || undefined };
  const res = await api<SignupResponse>('/signup', { method: 'POST', body });
  if (!res.ok) {
    return {
      status: 'error',
      message: res.message,
      fieldErrors: res.status === 409 ? { slug: [res.message] } : res.fieldErrors,
      values,
    };
  }
  return { status: 'done', result: res.data };
}

/** null when the API can't be reached: the form then shows the plain hint. */
export async function slugAvailableAction(slug: string): Promise<boolean | null> {
  const res = await api<{ available: boolean }>(`/signup/slug?slug=${encodeURIComponent(slug)}`);
  return res.ok ? res.data.available : null;
}
