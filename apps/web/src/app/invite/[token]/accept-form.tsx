'use client';

import { Alert, Button } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { acceptInviteAction } from './actions';

export function AcceptForm({ token }: { token: string }) {
  const t = useTranslations('invite');
  const [state, action, pending] = useActionState(acceptInviteAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      {state.error ? (
        <Alert variant="destructive" role="alert">
          {state.error}
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending} className="sm:self-start">
        {pending ? t('accepting') : t('accept')}
      </Button>
    </form>
  );
}
