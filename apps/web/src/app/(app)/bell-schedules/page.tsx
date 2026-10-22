import { formatTime, type BellScheduleRow } from '@slotwise/shared';
import { Badge, buttonVariants } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageHeader } from '@/components/app-shell';
import { getMe, list } from '@/lib/me';

export const metadata: Metadata = { title: 'Bell schedules' };

export default async function BellSchedulesPage() {
  const me = await getMe('/bell-schedules');
  const [t, tEntity] = await Promise.all([getTranslations('bell'), getTranslations('entity')]);
  const rows = await list<BellScheduleRow>('/bell-schedules');
  const canManage = me.may('calendar.manage');
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')}>
        {canManage ? (
          <Link href="/bell-schedules/new" className={buttonVariants()}>
            {t('add')}
          </Link>
        ) : null}
      </PageHeader>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border">
          {rows.map((b) => {
            const first = b.periods[0];
            const last = b.periods[b.periods.length - 1];
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {b.name} {b.isDefault ? <Badge>{t('default')}</Badge> : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {b.workingDays.map((d) => tEntity(`weekdayShort.${d}`)).join(', ')} ·{' '}
                    {first && last
                      ? t('summary', {
                          count: b.periods.length,
                          start: formatTime(first.startMinute),
                          end: formatTime(last.endMinute),
                        })
                      : ''}
                    {b.breaks.length
                      ? ` · ${b.breaks.map((x) => t('breakAfter', { label: x.label, period: x.afterPeriodIndex, minutes: x.minutes })).join(', ')}`
                      : ''}
                  </p>
                </div>
                <Link
                  href={`/bell-schedules/${b.id}`}
                  className={buttonVariants({ size: 'sm', variant: 'outline' })}
                >
                  {canManage ? tEntity('edit') : t('view')}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
