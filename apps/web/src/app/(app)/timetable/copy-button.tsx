'use client';

import { Alert, Button } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { copyVersion } from './actions';

/** Published versions never change: this makes an editable draft copy and opens it. */
export function CopyButton({ versionId }: { versionId: string }) {
  const t = useTranslations('p2t.edit');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await copyVersion(versionId);
              if (!res.ok) return setError(res.message);
              const next = new URLSearchParams(params);
              next.set('version', res.versionId);
              router.push(`${pathname}?${next.toString()}`);
            })
          }
        >
          {pending ? t('copying') : t('copy')}
        </Button>
        <p className="text-sm text-muted-foreground">{t('copyHint')}</p>
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}
