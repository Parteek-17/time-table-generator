'use client';

import { Alert, Button } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { publishVersion, undoPublish } from './actions';

function useGoTo() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (set: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(set)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    router.push(`${pathname}?${next.toString()}`);
  };
}

/** Publishes the draft on screen. No confirm dialog: the notice after it offers Undo. */
export function PublishButton({
  versionId,
  unplacedCount,
}: {
  versionId: string;
  unplacedCount: number;
}) {
  const t = useTranslations('p2t.publish');
  const goTo = useGoTo();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await publishVersion(versionId);
              if (!res.ok) return setError(t('failed', { message: res.message }));
              goTo({ version: res.result.versionId, notice: 'published' });
            })
          }
        >
          {pending ? t('publishing') : t('publish')}
        </Button>
        <p className="text-sm text-muted-foreground">
          {t('hint')}
          {unplacedCount > 0 ? ` ${t('hasUnplaced', { count: unplacedCount })}` : null}
        </p>
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}

/**
 * After publishing: "Published as version N" with Undo. After undo: which version is back and
 * that the changes are in the draft now shown. Kept in the URL (?notice=) so a reload keeps it.
 */
export function PublishNotice({
  notice,
  versionId,
  number,
  restoredNumber,
}: {
  notice: 'published' | 'undone';
  versionId: string;
  number: number | null;
  /** After undo: the number of the version published again, if any. */
  restoredNumber: number | null;
}) {
  const t = useTranslations('p2t.publish');
  const goTo = useGoTo();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = (
    <Button type="button" variant="ghost" onClick={() => goTo({ notice: null })}>
      {t('dismiss')}
    </Button>
  );
  if (notice === 'undone') {
    return (
      <Alert variant="success" role="status" className="flex flex-wrap items-center gap-3">
        <span className="flex-1">
          {restoredNumber !== null ? t('undoneBack', { number: restoredNumber }) : t('undoneNone')}
        </span>
        {close}
      </Alert>
    );
  }
  return (
    <Alert variant="success" role="status" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex-1">{t('published', { number: number ?? 0 })}</span>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await undoPublish(versionId);
              if (!res.ok) return setError(t('undoFailed', { message: res.message }));
              goTo({
                version: res.result.draftVersionId,
                notice: 'undone',
                restored: res.result.restoredVersionId,
              });
            })
          }
        >
          {pending ? t('undoing') : t('undo')}
        </Button>
        {close}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </Alert>
  );
}
