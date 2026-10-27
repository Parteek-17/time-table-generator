import { IsoDate, PORTAL_TODAY_V1_ROUTE, type TodayV1 } from '@slotwise/shared/contracts';
import { addDays, localNow, VIEWER_EXTRAS } from '@slotwise/shared/portal';
import { Alert, buttonVariants, Card, CardDescription, CardHeader } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ExamSeatSlot } from '../../_components/exam-seat-card';
import {
  ClassItem,
  DayPager,
  formatDay,
  PortalProblem,
  PortalSection,
  PortalTabs,
} from '../../_components/portal-ui';

export const metadata: Metadata = { title: 'Today' };

/**
 * A student's or teacher's day: what's next, the day's classes (cancelled ones struck through
 * with the reason), changes this week and the exam seat. `?date=` shows another day.
 */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const asked = IsoDate.safeParse((await searchParams).date);
  const date = asked.success ? asked.data : undefined;
  const [t, tCommon, res] = await Promise.all([
    getTranslations('p5.today'),
    getTranslations('p5.common'),
    api<TodayV1>(date ? `${PORTAL_TODAY_V1_ROUTE}?date=${date}` : PORTAL_TODAY_V1_ROUTE),
  ]);

  if (!res.ok) {
    return (
      <>
        <PortalTabs active="today" />
        <PortalProblem status={res.status} message={res.message} />
      </>
    );
  }

  const today = res.data;
  const now = localNow(today.timezone);
  const isToday = today.date === now.date;
  const next = today.classes.find((c) => c.id === today.nextClassId) ?? null;
  const happening = next !== null && isToday && next.startMinute <= now.minute;
  const dayLabel = await formatDay(today.date);

  return (
    <>
      <PortalTabs active="today" />

      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground">
          {t('hello', { name: today.viewer.name })} · {today.viewer.groupLabel}
        </p>
        <h1 className="text-2xl font-semibold">{isToday ? t('title') : dayLabel}</h1>
        {isToday ? <p className="text-muted-foreground">{dayLabel}</p> : null}
      </div>

      <DayPager
        label={t('dayNav')}
        previous={{ href: `/today?date=${addDays(today.date, -1)}`, label: t('previousDay') }}
        middle={isToday ? undefined : { href: '/today', label: t('backToToday') }}
        next={{ href: `/today?date=${addDays(today.date, 1)}`, label: t('nextDay') }}
      />

      {today.holiday ? (
        <Alert role="status">{t('holidayBody', { name: today.holiday })}</Alert>
      ) : null}

      <ExamSeatSlot today={today} position="top" />

      {next ? (
        <PortalSection id="next" title={happening ? t('nowClass') : t('nextClass')}>
          <ul className="flex flex-col gap-2">
            <ClassItem item={next} badge={happening ? tCommon('now') : tCommon('next')} />
          </ul>
        </PortalSection>
      ) : today.classes.length > 0 && isToday ? (
        <p className="text-muted-foreground">{t('noMoreToday')}</p>
      ) : null}

      <PortalSection id="classes" title={t('classes')}>
        <p className="sr-only">{t('classesCount', { count: today.classes.length })}</p>
        {today.classes.length === 0 ? (
          <p className="text-muted-foreground">{t('noClasses')}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {today.classes.map((c) => (
              <ClassItem key={c.id} item={c} compact />
            ))}
          </ol>
        )}
      </PortalSection>

      <Link
        href={`/week?date=${today.date}`}
        className="inline-flex min-h-11 items-center self-start text-primary underline underline-offset-4"
      >
        {t('seeWeek')}
      </Link>
      <Link
        href="/calendar"
        className="inline-flex min-h-11 items-center self-start text-primary underline underline-offset-4"
      >
        {t('addToCalendar')}
      </Link>

      {VIEWER_EXTRAS[today.viewer.role].availability ? (
        <Card>
          <CardHeader>
            <CardDescription className="text-base">{t('availabilityHint')}</CardDescription>
            <Link
              href="/me/availability"
              className={buttonVariants({ variant: 'outline', className: 'mt-2 self-start' })}
            >
              {t('availability')}
            </Link>
          </CardHeader>
        </Card>
      ) : null}

      <PortalSection id="changes" title={t('changes')}>
        {today.changes.length === 0 ? (
          <p className="text-muted-foreground">{t('noChanges')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {today.changes.map((c, i) => (
              <li key={`${c.kind}-${c.classId ?? 'day'}-${i}`} className="rounded-lg border p-3">
                {c.message}
              </li>
            ))}
          </ul>
        )}
      </PortalSection>

      <ExamSeatSlot today={today} position="bottom" />
    </>
  );
}
