'use server';

import type { ProvisionInstituteResponseV1 } from '@slotwise/shared/contracts';
import { DEFAULT_PLAN, type PlatformInstituteDto } from '@slotwise/shared/platform';
import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export interface PlanFormState {
  status: 'idle' | 'saved' | 'error';
  message?: string;
}

export async function setPlanAction(_prev: PlanFormState, form: FormData): Promise<PlanFormState> {
  const id = String(form.get('instituteId') ?? '');
  const res = await api<PlatformInstituteDto['plan']>(
    `/platform/institutes/${encodeURIComponent(id)}/plan`,
    { method: 'PUT', body: { planCode: String(form.get('planCode') ?? '') } },
  );
  if (!res.ok) return { status: 'error', message: res.message };
  revalidatePath('/platform');
  return { status: 'saved' };
}

export interface CreateInstituteState {
  status: 'idle' | 'done' | 'error';
  message?: string;
  fieldErrors?: Record<string, string[]>;
  values?: Record<string, string>;
  result?: { name: string; email: string; url: string };
  /** Set when the institute exists but its plan could not be saved. */
  planError?: string;
}

const FIELDS = [
  'name',
  'slug',
  'type',
  'affiliatingUniversityName',
  'adminName',
  'adminEmail',
  'planCode',
  'withSampleData',
] as const;

/** POST /platform/institutes (institute-provisioning.v1), then the plan if not the default. */
export async function createInstituteAction(
  _prev: CreateInstituteState,
  form: FormData,
): Promise<CreateInstituteState> {
  const values = Object.fromEntries(FIELDS.map((f) => [f, String(form.get(f) ?? '')]));
  const res = await api<ProvisionInstituteResponseV1>('/platform/institutes', {
    method: 'POST',
    body: {
      version: 'institute-provisioning.v1',
      name: values.name,
      slug: values.slug?.trim().toLowerCase(),
      type: values.type,
      affiliatingUniversityName: values.affiliatingUniversityName?.trim() || null,
      firstAdmin: { email: values.adminEmail?.trim(), name: values.adminName },
      withSampleData: values.withSampleData === 'on',
      planCode: values.planCode || null,
    },
  });
  if (!res.ok) {
    const fieldErrors =
      res.fieldErrors ?? (res.status === 409 ? { slug: [res.message] } : undefined);
    return {
      status: 'error',
      message: res.message,
      fieldErrors: renameErrors(fieldErrors),
      values,
    };
  }
  const result = { name: values.name ?? '', email: values.adminEmail ?? '', url: res.data.url };

  let planError: string | undefined;
  if (values.planCode && values.planCode !== DEFAULT_PLAN) {
    const plan = await api(`/platform/institutes/${res.data.instituteId}/plan`, {
      method: 'PUT',
      body: { planCode: values.planCode },
    });
    if (!plan.ok) planError = plan.message;
  }
  revalidatePath('/platform');
  return { status: 'done', result, planError };
}

/** The contract's field paths → this form's field names. */
function renameErrors(errors?: Record<string, string[]>): Record<string, string[]> | undefined {
  if (!errors) return undefined;
  const names: Record<string, string> = {
    'firstAdmin.email': 'adminEmail',
    'firstAdmin.name': 'adminName',
  };
  return Object.fromEntries(Object.entries(errors).map(([k, v]) => [names[k] ?? k, v]));
}
