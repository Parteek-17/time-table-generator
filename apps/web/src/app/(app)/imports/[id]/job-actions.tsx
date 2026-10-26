'use client';

import { Alert, Button } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { cancelImport, commitImport } from '../actions';

/** Re-reads the page every 2 seconds while the file is read or imported in the background. */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}

/** "Import 12 rows", blocked while rows have problems. */
export function CommitBar({
  jobId,
  problems,
  toImport,
}: {
  jobId: string;
  problems: number;
  toImport: number;
}) {
  const t = useTranslations('p1.imports');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={pending || problems > 0}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await commitImport(jobId);
              if (!res.ok) setError(res.message ?? null);
              router.refresh();
            })
          }
        >
          {pending ? t('importing') : t('commit', { count: toImport })}
        </Button>
        <p className="text-sm text-muted-foreground">
          {problems > 0 ? t('commitBlocked', { count: problems }) : t('commitHint')}
        </p>
      </div>
      {error ? (
        <Alert variant="destructive" role="alert">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}

export function CancelButton({ jobId }: { jobId: string }) {
  const t = useTranslations('p1.imports');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await cancelImport(jobId);
            router.refresh();
          })
        }
      >
        {t('cancel')}
      </Button>
    </div>
  );
}
