'use client';

import { PLAN_CODES, PLANS } from '@slotwise/shared/platform';
import { Button, FieldError, Label, NativeSelect } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useActionState, useId } from 'react';
import { setPlanAction, type PlanFormState } from './actions';

export function PlanForm({
  instituteId,
  instituteName,
  current,
}: {
  instituteId: string;
  instituteName: string;
  current: string | null;
}) {
  const t = useTranslations('p7.platform');
  const id = useId();
  const [state, action, pending] = useActionState<PlanFormState, FormData>(setPlanAction, {
    status: 'idle',
  });
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="instituteId" value={instituteId} />
      <div className="flex min-w-40 flex-1 flex-col gap-2">
        <Label htmlFor={id} className="sr-only">
          {t('plan', { name: instituteName })}
        </Label>
        <NativeSelect id={id} name="planCode" defaultValue={current ?? 'trial'}>
          {PLAN_CODES.map((code) => (
            <option key={code} value={code}>
              {PLANS[code].name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {t('changePlan')}
      </Button>
      <span role="status" className="w-full text-sm">
        {state.status === 'saved' ? t('planSaved') : null}
      </span>
      {state.status === 'error' ? (
        <FieldError className="w-full">{state.message}</FieldError>
      ) : null}
    </form>
  );
}
