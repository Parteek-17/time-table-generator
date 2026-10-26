import { formatTime } from '@slotwise/shared';
import { slotDetails, type ViewKind, type ViewSlot } from '@slotwise/shared/timetable';
import { cn } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/**
 * One class in a timetable cell. Local until the UI kit ships `SlotCard` (requests/
 * 2026-10-23-p2t-ui-timetable-grid.md); same props. The kind of class is written out ("Lab",
 * "Tut"), never shown by colour alone.
 */
export function SlotCard({
  slot,
  kind,
  whoName,
  className,
  actions,
}: {
  slot: ViewSlot;
  /** Whose week this is: decides what the second line shows. */
  kind: ViewKind;
  whoName: string;
  className?: string;
  /** Buttons under the card (Move, Lock) while editing. */
  actions?: ReactNode;
}) {
  const t = useTranslations('p2t');
  const detailText = slotDetails(slot, kind, whoName, t('grid.noRoom'));
  const tag = slot.component === 'lecture' ? null : t(`grid.tag.${slot.component}`);
  const periods =
    slot.length > 1
      ? t('grid.periods', {
          first: `P${slot.startPeriodIndex}`,
          last: `P${slot.startPeriodIndex + slot.length - 1}`,
        })
      : `P${slot.startPeriodIndex}`;

  return (
    <div
      className={cn(
        'flex h-full min-w-0 flex-col gap-0.5 rounded-md border px-2 py-1.5 text-left',
        slot.component === 'practical'
          ? 'border-success/40 bg-success/10'
          : slot.component === 'tutorial'
            ? 'border-border bg-secondary'
            : 'border-primary/30 bg-primary/10',
        className,
      )}
      aria-label={t('grid.slot', {
        code: slot.course.code,
        title: slot.course.title,
        component: t(`grid.component.${slot.component}`),
        details: detailText,
        day: t(`days.long.${slot.weekday}`),
        periods,
        start: formatTime(slot.startMinute),
        end: formatTime(slot.endMinute),
      })}
      role="group"
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-mono text-sm font-medium">{slot.course.code}</span>
        <span className="flex shrink-0 gap-1">
          {slot.locked ? (
            <span className="rounded bg-foreground px-1 text-xs font-semibold text-background">
              {t('edit.locked')}
            </span>
          ) : null}
          {tag ? (
            <span className="rounded border border-current px-1 text-xs font-semibold uppercase tracking-wide opacity-80">
              {tag}
            </span>
          ) : null}
        </span>
      </div>
      <span className="truncate text-sm" title={slot.course.title}>
        {slot.course.shortName || slot.course.title}
      </span>
      <span className="mt-auto truncate text-xs text-muted-foreground" title={detailText}>
        {detailText}
      </span>
      {actions ? <div className="mt-1 flex flex-wrap gap-1">{actions}</div> : null}
    </div>
  );
}
