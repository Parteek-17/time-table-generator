import { formatTime } from '@slotwise/shared';
import {
  dayCells,
  gridColumns,
  type GridBell,
  type ViewKind,
  type ViewSlot,
} from '@slotwise/shared/timetable';
import { useTranslations } from 'next-intl';
import { cn } from './cn';
import { SlotCard } from './slot-card';

/**
 * The week as a table: days down, periods across, breaks between. Lab blocks span their
 * periods (and a short break inside them); classes that overlap share one cell. The layout
 * comes from `gridColumns()` / `dayCells()` in @slotwise/shared; this only draws it.
 *
 * Wide on purpose: it scrolls sideways inside its own box (the day column stays put), so a
 * 400px phone never scrolls the page. Pair it with a day-at-a-time list on phones.
 */
export function TimetableGrid({
  bell,
  slots,
  kind,
  whoName,
  className,
}: {
  bell: GridBell;
  slots: ViewSlot[];
  kind: ViewKind;
  whoName: string;
  className?: string;
}) {
  const t = useTranslations('ui.timetable');
  const tDays = useTranslations('ui.days');
  const columns = gridColumns(bell);
  return (
    // relative: the sr-only labels (absolutely positioned) stay inside the scroll box instead
    // of widening the page. tabIndex: keyboard users can scroll it with the arrow keys.
    <div
      role="region"
      aria-label={t('caption', { name: whoName })}
      tabIndex={0}
      className={cn(
        'relative overflow-x-auto rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <table className="w-full min-w-[56rem] border-collapse text-sm">
        <caption className="sr-only">{t('caption', { name: whoName })}</caption>
        <thead>
          <tr className="border-b bg-muted/50">
            <th scope="col" className="sticky left-0 z-10 w-16 bg-muted px-2 py-2 text-left">
              <span className="sr-only">{t('day')}</span>
            </th>
            {columns.map((c) =>
              c.kind === 'period' ? (
                <th key={`p${c.index}`} scope="col" className="px-1 py-2 text-left font-medium">
                  <span className="block">{c.label}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {formatTime(c.startMinute)}–{formatTime(c.endMinute)}
                  </span>
                </th>
              ) : (
                <th key={`b${c.afterPeriodIndex}`} scope="col" className="w-6 px-0">
                  <span className="sr-only">
                    {t('break', { label: c.label, minutes: c.minutes })}
                  </span>
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {bell.workingDays.map((weekday, row) => (
            <tr key={weekday} className="border-b last:border-b-0">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-background px-2 py-1 text-left align-top font-medium"
              >
                <abbr title={tDays(`long.${weekday}`)} className="no-underline">
                  {tDays(`short.${weekday}`)}
                </abbr>
              </th>
              {dayCells(slots, weekday, bell).map((cell) => {
                if (cell.kind === 'break') {
                  return (
                    <td
                      key={`b${cell.afterPeriodIndex}`}
                      className="bg-muted/60 px-0 text-center align-middle text-xs text-muted-foreground"
                    >
                      {/* The label once, on the first day; screen readers get it from the header. */}
                      {row === 0 ? (
                        <span
                          aria-hidden="true"
                          className="inline-block -rotate-90 whitespace-nowrap"
                        >
                          {cell.label}
                        </span>
                      ) : null}
                    </td>
                  );
                }
                if (cell.kind === 'free') {
                  return (
                    <td key={`f${cell.period}`} className="h-20 p-1">
                      <span className="sr-only">{t('free')}</span>
                    </td>
                  );
                }
                return (
                  <td
                    key={`c${cell.startPeriod}`}
                    colSpan={cell.columns}
                    className="h-20 p-1 align-top"
                  >
                    <div className="flex h-full flex-col gap-1">
                      {cell.slots.map((slot) => (
                        <SlotCard
                          key={slot.id}
                          slot={slot}
                          kind={kind}
                          whoName={whoName}
                          className="flex-1"
                        />
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
