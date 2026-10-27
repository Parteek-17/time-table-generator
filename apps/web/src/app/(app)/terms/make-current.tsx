'use client';

import { Button } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { sendToApi } from '@/lib/entity-actions';

/** One step to switch terms: this one becomes current, the current one is closed. */
export function MakeCurrent({ id, label }: { id: string; label: string }) {
  const t = useTranslations('terms');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        aria-label={t('makeCurrentFor', { label })}
        onClick={() =>
          startTransition(async () => {
            const res = await sendToApi('POST', `/terms/${id}/activate`, undefined, '/terms');
            setError(res.ok ? null : (res.message ?? null));
          })
        }
      >
        {t('makeCurrent')}
      </Button>
      {error ? (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      ) : null}
    </>
  );
}
