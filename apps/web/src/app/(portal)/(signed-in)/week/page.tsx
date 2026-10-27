import { IsoDate } from '@slotwise/shared/contracts';
import { addDays, PORTAL_WEEK_ROUTE, type PortalWeekV1 } from '@slotwise/shared/portal';
import { Badge, cn } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  ClassItem,
  DayPager,
  formatDay,
  PortalProblem,
  PortalTabs,
} from '../../_components/portal-ui';

export const metadata: Metadata = { title: 'Week' };

/** The viewer's week, one day after another (phones), with holidays and cancellations. */
export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const asked = IsoDate.safeParse((await searchParams).date);
  const date = asked.success ? asked.data : undefined;
  const [t, tCommon, res] = await Promise.all([
    getTranslations('p5.week'),
    getTranslations('p5.common'),
    api<PortalWeekV1>(date ? `${PORTAL_WEEK_ROUTE}?date=${date}` : PORTAL_WEEK_ROUTE),
  ]);

  if (!res.ok) {
    return (
      <>
        <PortalTabs active="week" />
        <PortalProblem status={res.status} message={res.message} />
      </>
    );
  }

  const week = res.data;
  const thisWeek = week.today >= week.weekStart && week.today <= addDays(week.weekStart, 6);
  const days = await Promise.all(
    week.days.map(async (d) => ({ ...d, label: await formatDay(d.date) })),
  );

  return (
    <>
      <PortalTabs active="week" />
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground">
          {week.viewer.name} · {week.viewer.groupLabel}
        </p>
        <h1 className="text-2xl font-semibold">
          {thisWeek ? t('title') : t('titleOf', { date: await formatDay(week.weekStart, 'short') })}
        </h1>
      </div>

      <DayPager
        label={t('weekNav')}
        previous={{ href: `/week?date=${addDays(week.weekStart, -7)}`, label: t('previousWeek') }}
        middle={thisWeek ? undefined : { href: '/week', label: t('thisWeek') }}
        next={{ href: `/week?date=${addDays(week.weekStart, 7)}`, label: t('nextWeek') }}
      />

      {days.map((day) => {
        const isToday = day.date === week.today;
        const headingId = `day-${day.date}`;
        return (
          <section
            key={day.date}
            aria-labelledby={headingId}
            className={cn('flex flex-col gap-2', isToday && 'rounded-lg ring-2 ring-primary p-2')}
          >
            <h2 id={headingId} className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              <Link
                href={`/today?date=${day.date}`}
                className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                aria-label={t('openDay', { date: day.label })}
              >
                {day.label}
              </Link>
              {isToday ? <Badge>{t('todayBadge')}</Badge> : null}
            </h2>
            {day.holiday ? (
              <p className="rounded-lg border border-dashed p-3">
                {tCommon('holiday', { name: day.holiday })}
              </p>
            ) : null}
            {day.classes.length === 0 ? (
              day.holiday ? null : (
                <p className="text-muted-foreground">
                  {day.teaching ? t('noClasses') : t('notTeaching')}
                </p>
              )
            ) : (
              <ol className="flex flex-col gap-2">
                {day.classes.map((c) => (
                  <ClassItem key={c.id} item={c} compact />
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </>
  );
}
