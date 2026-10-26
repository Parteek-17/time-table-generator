'use client';

import type { SampleInstituteDto, SetupStep } from '@slotwise/shared';
import { Alert, Button, buttonVariants } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { sendToApi } from '@/lib/entity-actions';

/**
 * Back / Skip for now / Save and continue. Progress is saved on the server, so the admin can
 * stop at any time and resume from /setup.
 */
export function WizardNav({
  step,
  prev,
  next,
  canEdit,
  isLast,
}: {
  step: SetupStep;
  prev: SetupStep | null;
  next: SetupStep | null;
  canEdit: boolean;
  isLast: boolean;
}) {
  const t = useTranslations('p1.setup');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const mark = (status: 'done' | 'skipped') =>
    start(async () => {
      const res = await sendToApi('PUT', `/setup/steps/${step}`, { status }, '/setup');
      if (!res.ok) {
        setError(res.message ?? t('saveFailed'));
        return;
      }
      router.push(next && !isLast ? `/setup/${next}` : '/setup');
    });

  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
      <div aria-live="polite">
        {error ? (
          <Alert variant="destructive" role="alert">
            {error}
          </Alert>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {prev ? (
          <Link href={`/setup/${prev}`} className={buttonVariants({ variant: 'ghost' })}>
            {t('back')}
          </Link>
        ) : (
          <Link href="/setup" className={buttonVariants({ variant: 'ghost' })}>
            {t('overview')}
          </Link>
        )}
        <span className="flex-1" />
        {canEdit ? (
          <>
            <Button variant="outline" disabled={pending} onClick={() => mark('skipped')}>
              {t('skip')}
            </Button>
            <Button disabled={pending} onClick={() => mark('done')}>
              {pending ? t('saving') : isLast ? t('finish') : t('continue')}
            </Button>
          </>
        ) : next ? (
          <Link href={`/setup/${next}`} className={buttonVariants()}>
            {t('next')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** "Try with sample data": a separate institute filled with the fictional sample. */
export function SampleDataButton() {
  const t = useTranslations('p1.setup');
  const [result, setResult] = useState<SampleInstituteDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="outline"
        className="self-start"
        disabled={pending || result != null}
        onClick={() =>
          start(async () => {
            const res = await sendToApi<SampleInstituteDto>(
              'POST',
              '/setup/sample-institute',
              undefined,
              '/setup',
            );
            if (res.ok && res.data) setResult(res.data);
            else setError(res.message ?? t('sampleFailed'));
          })
        }
      >
        {pending ? t('sampleCreating') : t('sampleButton')}
      </Button>
      <div aria-live="polite">
        {error ? (
          <Alert variant="destructive" role="alert">
            {error}
          </Alert>
        ) : null}
        {result ? (
          <Alert variant="success" className="flex flex-col gap-2">
            <p>{t('sampleReady')}</p>
            <a className="font-medium text-primary underline" href={result.url}>
              {result.url}
            </a>
            <p className="text-sm">{t('sampleSignIn')}</p>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
