import { formatTime } from '@slotwise/shared';
import { slotDetails, type ViewKind, type ViewSlot } from '@slotwise/shared/timetable';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from './cn';

/** "P3", or "P3–P4" for a lab block. */
export function slotPeriods(slot: Pick<ViewSlot, 'startPeriodIndex' | 'length'>): string {
  const first = `P${slot.startPeriodIndex}`;
  return slot.length > 1 ? `${first}–P${slot.startPeriodIndex + slot.length - 1}` : first;
}

const tone: Record<ViewSlot['component'], string> = {
  lecture: 'border-primary/30 bg-primary/10',
  tutorial: 'border-border bg-secondary',
  practical: 'border-success/40 bg-success/10',
};

/**
 * One class in a timetable cell: course code, name, then who/where (what that line shows
 * depends on whose week it is). "Lab", "Tut" and "Locked" are written on the card, never shown
 * by colour alone, and the card has one `aria-label` with the full sentence.
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
  /** Name of the section, group, teacher or room whose week this is. */
  whoName: string;
  className?: string;
  /** Buttons under the card (Move, Lock) while editing. */
  actions?: ReactNode;
}) {
  const t = useTranslations('ui.timetable');
  const tDays = useTranslations('ui.days');
  const detailText = slotDetails(slot, kind, whoName, t('noRoom'));
  const tag = slot.component === 'lecture' ? null : t(`tag.${slot.component}`);

  return (
    <div
      role="group"
      aria-label={t('slot', {
        code: slot.course.code,
        title: slot.course.title,
        component: t(`component.${slot.component}`),
        details: detailText,
        day: tDays(`long.${slot.weekday}`),
        periods: slotPeriods(slot),
        start: formatTime(slot.startMinute),
        end: formatTime(slot.endMinute),
        locked: slot.locked ? 'yes' : 'no',
      })}
      className={cn(
        'flex h-full min-w-0 flex-col gap-0.5 rounded-md border px-2 py-1.5 text-left forced-colors:border-[CanvasText]',
        tone[slot.component],
        className,
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-mono text-sm font-medium">{slot.course.code}</span>
        <span className="flex shrink-0 gap-1">
          {slot.locked ? (
            <span className="rounded bg-foreground px-1 text-xs font-semibold text-background forced-colors:border">
              {t('locked')}
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
