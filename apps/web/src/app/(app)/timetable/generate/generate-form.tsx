'use client';

import type { SolveJobDto } from '@slotwise/shared/timetable';
import { Alert, Button, buttonVariants, Label, NativeSelect } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useId, useState, useTransition } from 'react';
import { jobStatus, startGenerate } from '../actions';

const POLL_MS = 1500;

/** Pick the classes and how long to search, start, and watch the progress until the draft is ready. */
export function GenerateForm({
  termId,
  scopes,
  running,
}: {
  termId: string;
  scopes: { id: string; name: string; cohortCount: number }[];
  /** A run of this term already in progress (after a reload). */
  running: SolveJobDto | null;
}) {
  const t = useTranslations('p2t.generate');
  const ids = { scope: useId(), time: useId(), hint: useId() };
  const [scopeId, setScopeId] = useState('');
  const [time, setTime] = useState('60');
  const [job, setJob] = useState<SolveJobDto | null>(running);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const active = job?.status === 'queued' || job?.status === 'running';
  useEffect(() => {
    if (!job || !active) return;
    const timer = setTimeout(async () => {
      const res = await jobStatus(job.id);
      if (res.ok) setJob(res.job);
      else setError(t('lostTrack'));
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [job, active, t]);

  const start = () =>
    startTransition(async () => {
      setError(null);
      const res = await startGenerate(termId, {
        scopeId: scopeId || null,
        timeLimitSeconds: Number(time),
      });
      if (res.ok) setJob(res.job);
      else setError(res.message);
    });

  if (job && !active) {
    if (job.status === 'succeeded' && job.versionId) {
      const summary = job.summary;
      return (
        <div className="flex flex-col gap-4">
          <Alert variant="success">
            <p className="font-semibold">{t('doneTitle')}</p>
            {summary ? (
              <p>{t('doneBody', { placed: summary.placed, unplaced: summary.unplaced })}</p>
            ) : null}
            <p className="text-muted-foreground">{t('draftNote')}</p>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/timetable?term=${termId}&version=${job.versionId}`}
              className={buttonVariants()}
            >
              {t('open')}
            </Link>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <p className="font-semibold">{t('failedTitle')}</p>
          <p>{job.error}</p>
        </Alert>
        <div>
          <Button type="button" onClick={() => setJob(null)}>
            {t('tryAgain')}
          </Button>
        </div>
      </div>
    );
  }

  if (job) {
    const label = job.status === 'queued' ? t('queued') : t('running', { progress: job.progress });
    return (
      <div className="flex flex-col gap-2">
        <div
          role="progressbar"
          aria-label={t('progress')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={job.progress}
          className="h-3 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${Math.max(job.progress, 3)}%` }}
          />
        </div>
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {label}
        </p>
        {error ? <Alert variant="destructive">{error}</Alert> : null}
      </div>
    );
  }

  return (
    <form
      className="flex max-w-md flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start();
      }}
    >
      {scopes.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.scope}>{t('classes')}</Label>
          <NativeSelect id={ids.scope} value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
            <option value="">{t('wholeTerm')}</option>
            {scopes.map((s) => (
              <option key={s.id} value={s.id}>
                {t('scopeOption', { name: s.name, count: s.cohortCount })}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.time}>{t('time')}</Label>
        <NativeSelect
          id={ids.time}
          value={time}
          aria-describedby={ids.hint}
          onChange={(e) => setTime(e.target.value)}
        >
          <option value="30">{t('time30')}</option>
          <option value="60">{t('time60')}</option>
          <option value="180">{t('time180')}</option>
        </NativeSelect>
        <p id={ids.hint} className="text-sm text-muted-foreground">
          {t('timeHint')}
        </p>
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {t('start')}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t('draftNote')}</p>
    </form>
  );
}
