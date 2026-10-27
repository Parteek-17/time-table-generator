'use client';

import { formatTime } from '@slotwise/shared';
import { dayCells, type GridBell, type ViewKind, type ViewSlot } from '@slotwise/shared/timetable';
import { cn } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import { SlotCard } from './slot-card.local';

/** ISO weekday of today in the viewer's clock (1 = Monday). */
const isoToday = () => ((new Date().getDay() + 6) % 7) + 1;
const noSubscription = () => () => {};

/** One day at a time, for phones: day buttons, then the day's periods in order. */
export function DayView({
  bell,
  slots,
  kind,
  whoName,
}: {
  bell: GridBell;
  slots: ViewSlot[];
  kind: ViewKind;
  whoName: string;
}) {
  const t = useTranslations('p2t');
  // The server has no "today" for the viewer (null); the browser reads its own clock.
  const today = useSyncExternalStore(noSubscription, isoToday, () => null);
  const [picked, setDay] = useState<number | null>(null);
  const day =
    picked ?? (today && bell.workingDays.includes(today) ? today : (bell.workingDays[0] ?? 1));

  const periods = new Map(bell.periods.map((p) => [p.index, p]));
  const all = dayCells(slots, day, bell);
  // The day ends with its last class: no list of free periods after it.
  const lastClass = all.findLastIndex((c) => c.kind === 'classes');
  const cells = all.slice(0, lastClass + 1);
  const hasClasses = lastClass >= 0;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label={t('day.label')}
        className="grid grid-cols-5 gap-1 sm:grid-cols-6"
      >
        {bell.workingDays.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={d === day}
            aria-label={
              d === today ? t('day.today', { day: t(`days.long.${d}`) }) : t(`days.long.${d}`)
            }
            onClick={() => setDay(d)}
            className={cn(
              'h-11 rounded-lg border text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              d === day
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted',
              d === today && d !== day && 'border-primary',
            )}
          >
            {t(`days.short.${d}`)}
          </button>
        ))}
      </div>

      {hasClasses ? (
        <ol className="flex flex-col gap-2" aria-label={t(`days.long.${day}`)}>
          {cells.map((cell) => {
            if (cell.kind === 'break') {
              return (
                <li
                  key={`b${cell.afterPeriodIndex}`}
                  className="px-1 text-xs text-muted-foreground"
                >
                  {t('grid.break', { label: cell.label, minutes: cell.minutes })}
                </li>
              );
            }
            const first = periods.get(cell.kind === 'free' ? cell.period : cell.startPeriod);
            const last = periods.get(cell.kind === 'free' ? cell.period : cell.endPeriod);
            const label =
              cell.kind === 'classes' && cell.endPeriod > cell.startPeriod
                ? `P${cell.startPeriod}–P${cell.endPeriod}`
                : `P${first?.index ?? ''}`;
            const time =
              first && last ? `${formatTime(first.startMinute)}–${formatTime(last.endMinute)}` : '';
            return (
              <li key={`${cell.kind}${label}`} className="flex gap-3">
                <div className="w-16 shrink-0 pt-1.5 text-sm">
                  <span className="block font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">{time}</span>
                </div>
                {cell.kind === 'free' ? (
                  <span className="flex-1 rounded-md border border-dashed px-2 py-2 text-sm text-muted-foreground">
                    {t('grid.free')}
                  </span>
                ) : (
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {cell.slots.map((slot) => (
                      <SlotCard key={slot.id} slot={slot} kind={kind} whoName={whoName} />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
          {t('day.none', { day: t(`days.long.${day}`) })}
        </p>
      )}
    </div>
  );
}
