'use client';

import type { DateSheetChoicesDto, InvigilatorDto } from '@slotwise/shared/exams';
import { Alert, Button, Checkbox } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { buildSeating, planStatus, publishPlan, setUnavailable } from '../../../actions';

type Room = DateSheetChoicesDto['rooms'][number];

/**
 * Pick halls (all exam rooms by default, ground floor first) and build the plan. The solver
 * runs as a background job; this follows it every second and refreshes the page when done.
 */
export function BuildSeating({
  sessionId,
  rooms,
  students,
  running,
}: {
  sessionId: string;
  rooms: Room[];
  students: number;
  running: string | null;
}) {
  const t = useTranslations('p6.build');
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(rooms.map((r) => r.id));
  const [planId, setPlanId] = useState<string | null>(running);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const seats = rooms.filter((r) => picked.includes(r.id)).reduce((n, r) => n + r.examSeats, 0);

  useEffect(() => {
    if (!planId) return;
    const timer = setInterval(async () => {
      const res = await planStatus(planId);
      if (!res.ok) {
        setError(res.message);
        setPlanId(null);
      } else if (res.data.status !== 'queued' && res.data.status !== 'running') {
        setPlanId(null);
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [planId, router]);

  if (rooms.length === 0) return <Alert>{t('noRooms')}</Alert>;
  return (
    <details className="rounded-md border p-3" open={!running}>
      <summary className="cursor-pointer font-medium">{t('title')}</summary>
      <fieldset className="mt-3 flex flex-col gap-2">
        <legend className="text-sm text-muted-foreground">{t('halls', { seats, students })}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {rooms.map((r) => (
            <label key={r.id} className="flex min-h-11 items-center gap-2 rounded border px-2">
              <Checkbox
                checked={picked.includes(r.id)}
                onChange={(e) =>
                  setPicked((now) =>
                    e.target.checked ? [...now, r.id] : now.filter((x) => x !== r.id),
                  )
                }
              />
              <span>
                {r.code}{' '}
                <span className="text-sm text-muted-foreground">
                  ({r.examSeats}
                  {r.isAccessible ? `, ${t('accessible')}` : ''})
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {seats < students ? <p className="mt-2 text-sm">{t('tooFew')}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={pending || !!planId || picked.length === 0}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              // Keep the rooms' order (ground floor first), whatever order they were ticked in.
              const res = await buildSeating(
                sessionId,
                rooms.filter((r) => picked.includes(r.id)).map((r) => r.id),
              );
              if (!res.ok) return setError(res.message);
              setPlanId(res.data.planId);
            })
          }
        >
          {planId ? t('building') : t('build')}
        </Button>
        {planId ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t('wait')}
          </p>
        ) : null}
      </div>
      {error ? (
        <Alert variant="destructive" className="mt-3">
          {error}
        </Alert>
      ) : null}
    </details>
  );
}

/** No confirm dialog: publishing an earlier plan again undoes it. */
export function PublishPlan({
  planId,
  path,
  hasProblems,
}: {
  planId: string;
  path: string;
  hasProblems: boolean;
}) {
  const t = useTranslations('p6.publish');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await publishPlan(planId, path);
            if (!res.ok) setError(res.message);
          })
        }
      >
        {pending ? t('publishing') : t('publish')}
      </Button>
      <p className="text-sm text-muted-foreground">{hasProblems ? t('hintProblems') : t('hint')}</p>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}

/** Teachers who cannot invigilate this session; the next plan leaves them out. */
export function Unavailable({
  sessionId,
  path,
  invigilators,
  editable,
}: {
  sessionId: string;
  path: string;
  invigilators: InvigilatorDto[];
  editable: boolean;
}) {
  const t = useTranslations('p6.unavailable');
  const [away, setAway] = useState<string[]>(
    invigilators.filter((f) => !f.available).map((f) => f.facultyId),
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer font-medium">
        {t('title', { away: away.length, total: invigilators.length })}
      </summary>
      <p className="mt-2 text-sm text-muted-foreground">{t('hint')}</p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {invigilators.map((f) => (
          <li key={f.facultyId}>
            <label className="flex min-h-11 items-center gap-2 rounded border px-2">
              <Checkbox
                disabled={!editable}
                checked={away.includes(f.facultyId)}
                onChange={(e) => {
                  setSaved(false);
                  setAway((now) =>
                    e.target.checked ? [...now, f.facultyId] : now.filter((x) => x !== f.facultyId),
                  );
                }}
              />
              <span>
                {f.name}{' '}
                <span className="text-sm text-muted-foreground">
                  {[
                    t('duties', { count: f.dutiesSoFar }),
                    f.teaches.length ? t('teaches', { codes: f.teaches.join(', ') }) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {editable ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const res = await setUnavailable(sessionId, away, path);
                if (!res.ok) return setError(res.message);
                setSaved(true);
              })
            }
          >
            {t('save')}
          </Button>
          {saved ? (
            <p role="status" className="text-sm">
              {t('saved')}
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <Alert variant="destructive" className="mt-3">
          {error}
        </Alert>
      ) : null}
    </details>
  );
}
