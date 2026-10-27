import { isFlagOn } from '@slotwise/shared';
import { clock, PublicTimetableV1 } from '@slotwise/shared/portal';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/page-shell';
import { Problem } from '@/components/problem';
import { formatDay } from '../../_components/portal-ui';
import { publicApi } from '../../_components/public-api';

export const metadata: Metadata = { title: 'Timetable', robots: { index: false } };

const TOKEN = /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{22}$/;

/**
 * A section's or room's published week for anyone with the link or QR code (notice boards,
 * classroom doors, WhatsApp groups). No sign-in; read only; prints on one page.
 */
export default async function PublicTimetablePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (!isFlagOn('P5')) notFound();
  const { token } = await params;
  const [t, tCommon] = await Promise.all([
    getTranslations('p5.public'),
    getTranslations('p5.common'),
  ]);
  if (!TOKEN.test(token)) {
    return (
      <PageShell>
        <Problem title={t('goneTitle')} body={t('goneBody')} />
      </PageShell>
    );
  }
  const res = await publicApi(`/portal/public/${token}`);
  const parsed = res.ok ? PublicTimetableV1.safeParse(await res.res.json()) : null;
  if (!parsed?.success) {
    return (
      <PageShell>
        <Problem
          title={!res.ok && res.status === 404 ? t('goneTitle') : tCommon('problemTitle')}
          body={!res.ok && res.status === 404 ? t('goneBody') : tCommon('problemBody')}
        />
      </PageShell>
    );
  }
  const week = parsed.data;
  // 2024-01-01 was a Monday, so 2024-01-0N is ISO weekday N.
  const dayNames = new Map(
    await Promise.all(
      week.workingDays.map(
        async (d) => [d, await formatDay(`2024-01-0${d}`, 'long', { weekday: 'long' })] as const,
      ),
    ),
  );
  const validFrom = week.validFrom
    ? await formatDay(week.validFrom, 'long', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <PageShell instituteName={week.instituteName}>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('title', { label: week.label })}</h1>
        <p className="text-muted-foreground">
          {week.versionNumber !== null && validFrom
            ? t('version', { number: week.versionNumber, date: validFrom })
            : t('notPublished')}
        </p>
        <p className="text-sm text-muted-foreground print:hidden">{t('liveNote')}</p>
      </div>

      {week.workingDays.map((weekday) => {
        const classes = week.classes.filter((c) => c.weekday === weekday);
        const id = `weekday-${weekday}`;
        return (
          <section
            key={weekday}
            aria-labelledby={id}
            className="flex flex-col gap-2 break-inside-avoid"
          >
            <h2 id={id} className="text-lg font-semibold">
              {dayNames.get(weekday)}
            </h2>
            {classes.length === 0 ? (
              <p className="text-muted-foreground">{t('noClasses')}</p>
            ) : (
              <ol className="flex flex-col gap-1">
                {classes.map((c, i) => (
                  <li
                    key={`${c.startMinute}-${c.courseCode}-${c.group}-${i}`}
                    className="grid grid-cols-[6.5rem_1fr] gap-x-3 rounded-lg border p-2 text-sm"
                  >
                    <span className="tabular-nums">
                      {tCommon('time', { start: clock(c.startMinute), end: clock(c.endMinute) })}
                    </span>
                    <span>
                      <strong>{c.courseShortName}</strong> {c.courseCode} ·{' '}
                      {tCommon(`component.${c.component}`)}
                      <br />
                      {week.kind === 'room' ? c.group : null}
                      {week.kind === 'room' ? ' · ' : null}
                      {c.teachers}
                      {week.kind === 'section' && c.roomCode
                        ? ` · ${tCommon('room', { room: c.roomCode })}`
                        : null}
                      {week.kind === 'section' && c.group !== week.label ? ` · ${c.group}` : null}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </PageShell>
  );
}
