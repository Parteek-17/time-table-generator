import type { SetupSnapshotV1, UnplacedSessionV1 } from '@slotwise/shared/contracts';
import { targetNames } from '@slotwise/shared/timetable';
import {
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

type Reason = UnplacedSessionV1['reason'];

/**
 * Where each reason gets fixed: P1's setup screens, linked by URL only (never P1's code), or a
 * hint for this timetable.
 */
const FIX: Record<Reason, { key: string; href: string | null }> = {
  no_free_slot: { key: 'faculty', href: '/faculty' },
  faculty_unavailable: { key: 'faculty', href: '/faculty' },
  faculty_over_max: { key: 'faculty', href: '/faculty' },
  no_suitable_room: { key: 'rooms', href: '/rooms' },
  room_too_small: { key: 'rooms', href: '/rooms' },
  lab_block_does_not_fit: { key: 'bell', href: '/bell-schedules' },
  blocked_by_fixed_slot: { key: 'calendar', href: '/calendar' },
  locked_conflict: { key: 'unlock', href: null },
  time_limit: { key: 'generate', href: '/timetable/generate' },
  other: { key: 'faculty', href: null },
};

/** "Not placed": what the solver could not fit, why in plain words, and where to fix it. */
export function UnplacedPanel({
  unplaced,
  snapshot,
  termId,
}: {
  unplaced: UnplacedSessionV1[];
  snapshot: SetupSnapshotV1;
  termId: string;
}) {
  const t = useTranslations('p2t.unplaced');
  if (unplaced.length === 0) return null;
  const courses = new Map(snapshot.courses.map((c) => [c.id, c]));
  const assignments = new Map(snapshot.assignments.map((a) => [a.id, a]));
  const names = targetNames(snapshot);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title', { count: unplaced.length })}</CardTitle>
        <CardDescription>{t('intro')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {unplaced.map((u) => {
            const a = assignments.get(u.assignmentId);
            const course = courses.get(a?.courseId ?? u.involved.courseIds[0] ?? '');
            const audience = a
              ? names.get(a.sectionId ?? a.subGroupId ?? a.electiveSectionId ?? '')
              : undefined;
            const fix = FIX[u.reason];
            const href =
              fix.href === '/timetable/generate' ? `${fix.href}?term=${termId}` : fix.href;
            return (
              <li
                key={u.sessionId}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    <span className="font-mono">{course?.code ?? '—'}</span> {course?.title}
                    {audience ? <span className="text-muted-foreground"> · {audience}</span> : null}
                  </p>
                  <p>{t(`reason.${u.reason}`)}</p>
                  {u.message ? (
                    <p className="text-sm text-muted-foreground">
                      {t('solverSays', { message: u.message })}
                    </p>
                  ) : null}
                </div>
                {href ? (
                  <Link href={href} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    {t(`fix.${fix.key}`)}
                  </Link>
                ) : u.reason === 'locked_conflict' ? (
                  <p className="text-sm text-muted-foreground">{t('fix.unlock')}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
