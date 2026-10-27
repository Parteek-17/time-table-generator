import { formatTime } from '@slotwise/shared';
import {
  dayCells,
  gridColumns,
  type GridBell,
  type ViewKind,
  type ViewSlot,
} from '@slotwise/shared/timetable';
import { useTranslations } from 'next-intl';
import { SlotCard } from './slot-card.local';

/**
 * The week as a table: days down, periods across, breaks between. Lab blocks span their
 * periods. Local until the UI kit ships `TimetableGrid` (same props); wide, so it scrolls
 * sideways inside its own box and the day view is used on phones.
 */
export function TimetableGrid({
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
  const columns = gridColumns(bell);
  return (
    // relative: the sr-only labels (absolutely positioned) stay inside the scroll box instead
    // of widening the page.
    <div className="relative overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[56rem] border-collapse text-sm">
        <caption className="sr-only">{t('grid.caption', { name: whoName })}</caption>
        <thead>
          <tr className="border-b bg-muted/50">
            <th scope="col" className="sticky left-0 z-10 w-16 bg-muted px-2 py-2 text-left">
              <span className="sr-only">{t('grid.day')}</span>
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
                    {t('grid.break', { label: c.label, minutes: c.minutes })}
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
                <abbr title={t(`days.long.${weekday}`)} className="no-underline">
                  {t(`days.short.${weekday}`)}
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
                        <span aria-hidden className="inline-block -rotate-90 whitespace-nowrap">
                          {cell.label}
                        </span>
                      ) : null}
                    </td>
                  );
                }
                if (cell.kind === 'free') {
                  return (
                    <td key={`f${cell.period}`} className="h-20 p-1">
                      <span className="sr-only">{t('grid.free')}</span>
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
