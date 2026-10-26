'use client';

import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { formatTime } from '@slotwise/shared';
import {
  dayCells,
  gridColumns,
  slotIsFor,
  subGroupSections,
  TimetableChecker,
  type EditorDataDto,
  type EditorSlot,
  type EditProblem,
  type GridBell,
  type MoveTarget,
  type TimetableFor,
} from '@slotwise/shared/timetable';
import {
  Alert,
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
} from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { editSlot } from './actions';
import { DayView } from './day-view';
import { SlotCard } from './slot-card.local';

/** One change on the undo stack; undo sends its opposite. */
type Change =
  | {
      type: 'move';
      slotId: string;
      from: MoveTarget & { roomId: string | null };
      to: MoveTarget & { roomId: string | null };
    }
  | { type: 'lock'; slotId: string; locked: boolean };

type Notice = { tone: 'ok' | 'bad'; text: string; reasons?: string[] } | null;

const cellKey = (weekday: number, period: number) => `${weekday}:${period}`;
const periodsLabel = (start: number, length: number) =>
  length > 1 ? `P${start}–P${start + length - 1}` : `P${start}`;

/** The fields slotIsFor() reads, from a slot in the contract's shape. */
const matchFields = (s: EditorSlot) => ({
  targetKind: s.target.kind,
  targetId: s.target.id,
  sectionIds: s.sectionIds,
  facultyIds: s.faculty.map((f) => f.id),
  roomId: s.room?.id ?? null,
});

function DropCell({
  id,
  state,
  colSpan,
  children,
}: {
  id: string;
  state: 'idle' | 'valid' | 'invalid' | 'over-valid' | 'over-invalid';
  colSpan?: number;
  children?: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <td
      ref={setNodeRef}
      colSpan={colSpan}
      className={cn(
        'h-24 p-1 align-top transition-colors motion-reduce:transition-none',
        state === 'valid' && 'bg-success/10 ring-2 ring-inset ring-success/60',
        state === 'over-valid' && 'bg-success/25 ring-2 ring-inset ring-success',
        state === 'invalid' && 'bg-muted/40',
        state === 'over-invalid' && 'bg-destructive/10 ring-2 ring-inset ring-destructive',
      )}
    >
      {children}
    </td>
  );
}

function DragHandle({ slot, children }: { slot: EditorSlot; children: ReactNode }) {
  const { setNodeRef, listeners, transform, isDragging } = useDraggable({
    id: slot.id,
    disabled: slot.locked,
  });
  return (
    // Pointer drag only: keyboard and touch users have the Move button, so the card keeps its
    // own role instead of becoming a button with buttons inside.
    <div
      ref={setNodeRef}
      {...listeners}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn(
        'h-full flex-1',
        !slot.locked && 'cursor-grab active:cursor-grabbing',
        isDragging && 'relative z-20 opacity-90 shadow-lg',
      )}
    >
      {children}
    </div>
  );
}

/**
 * The draft editor: the week grid with drag and drop (valid periods light up while dragging; a
 * refused drop says why), a Move menu for keyboard and touch, locks, and undo/redo. Every change
 * is checked here and again by the API with the same TimetableChecker, and saved at once.
 */
export function TimetableEditor({
  versionId,
  termId,
  data,
  who,
  bell,
}: {
  versionId: string;
  termId: string;
  data: EditorDataDto;
  who: TimetableFor & { name: string };
  bell: GridBell;
}) {
  const t = useTranslations('p2t');
  const [slots, setSlots] = useState(data.slots);
  // Fresh data from the server (another view, a reload) replaces local slots; undo stays.
  const [shownData, setShownData] = useState(data);
  if (data !== shownData) {
    setShownData(data);
    setSlots(data.slots);
  }
  const [undoStack, setUndo] = useState<Change[]>([]);
  const [redoStack, setRedo] = useState<Change[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const moveHeading = useRef<HTMLHeadingElement>(null);

  const checker = useMemo(
    () => new TimetableChecker(data.snapshot, slots, data.busy),
    [data.snapshot, data.busy, slots],
  );
  const groupSection = useMemo(() => subGroupSections(data.snapshot), [data.snapshot]);
  const shown = slots.filter((s) =>
    slotIsFor(
      matchFields(s),
      who,
      who.kind === 'subgroup' ? (groupSection.get(who.id) ?? null) : null,
    ),
  );
  const validDuringDrag = useMemo(
    () =>
      dragging
        ? new Set(checker.validStarts(dragging).map((c) => cellKey(c.weekday, c.startPeriodIndex)))
        : null,
    [dragging, checker],
  );
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const say = useCallback(
    (p: EditProblem) =>
      t(`problems.${p.code}`, {
        ...p.params,
        breakName: String(p.params.break ?? ''),
        day: p.params.weekday ? t(`days.long.${p.params.weekday}`) : '',
      }),
    [t],
  );

  const patch = (slotId: string, next: Partial<EditorSlot>) =>
    setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, ...next } : s)));

  /** Applies one change (or its opposite), here first, then on the server. */
  const run = useCallback(
    async (change: Change, direction: 'do' | 'undo' | 'redo'): Promise<boolean> => {
      const slot = checker.slot(change.slotId);
      if (!slot) return false;
      const before = { ...slot };
      setBusy(true);
      try {
        if (change.type === 'move') {
          const target = direction === 'undo' ? change.from : change.to;
          const plan = checker.plan(slot.id, target, target.roomId);
          if (!plan.ok) {
            setNotice({
              tone: 'bad',
              text: t('edit.refused', { code: slot.course.code }),
              reasons: plan.problems.map(say),
            });
            return false;
          }
          const times = checker.times(slot.id, target.startPeriodIndex)!;
          patch(slot.id, {
            weekday: target.weekday,
            startPeriodIndex: target.startPeriodIndex,
            ...times,
            room: plan.roomId && plan.roomCode ? { id: plan.roomId, code: plan.roomCode } : null,
          });
          const res = await editSlot(versionId, {
            type: 'move',
            slotId: slot.id,
            weekday: target.weekday,
            startPeriodIndex: target.startPeriodIndex,
            ...(plan.roomId ? { roomId: plan.roomId } : {}),
          });
          if (!res.ok) {
            patch(slot.id, before);
            setNotice({ tone: 'bad', text: t('edit.failed', { message: res.message }) });
            return false;
          }
          patch(slot.id, res.result.slot);
          const where = {
            code: slot.course.code,
            day: t(`days.long.${target.weekday}`),
            periods: periodsLabel(target.startPeriodIndex, slot.length),
          };
          setNotice({
            tone: 'ok',
            text:
              direction === 'undo'
                ? t('edit.undone')
                : direction === 'redo'
                  ? t('edit.redone')
                  : res.result.roomChanged
                    ? t('edit.movedRoom', { ...where, room: res.result.slot.room?.code ?? '' })
                    : t('edit.moved', where),
          });
        } else {
          const locked = direction === 'undo' ? !change.locked : change.locked;
          patch(slot.id, { locked });
          const res = await editSlot(versionId, { type: 'lock', slotId: slot.id, locked });
          if (!res.ok) {
            patch(slot.id, before);
            setNotice({ tone: 'bad', text: t('edit.failed', { message: res.message }) });
            return false;
          }
          setNotice({
            tone: 'ok',
            text:
              direction === 'undo'
                ? t('edit.undone')
                : direction === 'redo'
                  ? t('edit.redone')
                  : locked
                    ? t('edit.lockedDone', { code: slot.course.code })
                    : t('edit.unlockedDone', { code: slot.course.code }),
          });
        }
        if (direction === 'do') {
          setUndo((u) => [...u, change]);
          setRedo([]);
        } else if (direction === 'undo') {
          setUndo((u) => u.slice(0, -1));
          setRedo((r) => [...r, change]);
        } else {
          setRedo((r) => r.slice(0, -1));
          setUndo((u) => [...u, change]);
        }
        return true;
      } finally {
        setBusy(false);
      }
    },
    [checker, say, t, versionId],
  );

  const undo = useCallback(() => {
    const last = undoStack.at(-1);
    if (!last) return setNotice({ tone: 'ok', text: t('edit.nothingToUndo') });
    void run(last, 'undo');
  }, [undoStack, run, t]);
  const redo = useCallback(() => {
    const last = redoStack.at(-1);
    if (!last) return setNotice({ tone: 'ok', text: t('edit.nothingToRedo') });
    void run(last, 'redo');
  }, [redoStack, run, t]);

  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redo (not while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || busy) return;
      const el = e.target as HTMLElement | null;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, busy]);

  useEffect(() => {
    if (moving) moveHeading.current?.focus();
  }, [moving]);

  const move = (slot: EditorSlot, to: MoveTarget) => {
    if (to.weekday === slot.weekday && to.startPeriodIndex === slot.startPeriodIndex) return;
    void run(
      {
        type: 'move',
        slotId: slot.id,
        from: {
          weekday: slot.weekday,
          startPeriodIndex: slot.startPeriodIndex,
          roomId: slot.room?.id ?? null,
        },
        to: { ...to, roomId: null },
      },
      'do',
    );
  };

  const onDragStart = (e: DragStartEvent) => {
    setDragging(String(e.active.id));
    setNotice(null);
  };
  const onDragOver = (e: DragOverEvent) => setOver(e.over ? String(e.over.id) : null);
  const onDragEnd = (e: DragEndEvent) => {
    const slot = checker.slot(String(e.active.id));
    setDragging(null);
    setOver(null);
    if (!slot || !e.over) return;
    const [weekday, start] = String(e.over.id).split(':').map(Number);
    move(slot, { weekday: weekday!, startPeriodIndex: start! });
  };

  const overSlot = dragging ? checker.slot(dragging) : undefined;
  const overPlan =
    overSlot && over
      ? (() => {
          const [weekday, start] = over.split(':').map(Number);
          return checker.plan(overSlot.id, { weekday: weekday!, startPeriodIndex: start! });
        })()
      : null;
  const cellState = (key: string) => {
    if (!validDuringDrag) return 'idle' as const;
    const ok = validDuringDrag.has(key);
    if (key === over) return ok ? ('over-valid' as const) : ('over-invalid' as const);
    return ok ? ('valid' as const) : ('invalid' as const);
  };

  const card = (slot: EditorSlot) => (
    <DragHandle key={slot.id} slot={slot}>
      <SlotCard
        slot={slot}
        kind={who.kind}
        whoName={who.name}
        className="h-full"
        actions={
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              disabled={slot.locked || busy}
              aria-label={t('edit.moveLabel', { code: slot.course.code, who: slot.target.name })}
              onClick={() => setMoving(slot.id)}
            >
              {t('edit.move')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={busy}
              aria-pressed={slot.locked}
              aria-label={t(slot.locked ? 'edit.unlockLabel' : 'edit.lockLabel', {
                code: slot.course.code,
                who: slot.target.name,
              })}
              onClick={() =>
                void run({ type: 'lock', slotId: slot.id, locked: !slot.locked }, 'do')
              }
            >
              {slot.locked ? t('edit.unlock') : t('edit.lock')}
            </Button>
          </>
        }
      />
    </DragHandle>
  );

  const movingSlot = moving ? checker.slot(moving) : undefined;
  const columns = gridColumns(bell);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={undo}
          disabled={busy || undoStack.length === 0}
        >
          {t('edit.undo')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={redo}
          disabled={busy || redoStack.length === 0}
        >
          {t('edit.redo')}
        </Button>
        <Link
          href={`/timetable/generate?term=${termId}&base=${versionId}`}
          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          title={t('edit.resolveHint')}
        >
          {t('edit.resolve')}
        </Link>
        <p className="hidden text-sm text-muted-foreground md:block">{t('edit.dragHint')}</p>
      </div>

      <div aria-live="polite">
        {notice ? (
          <Alert variant={notice.tone === 'ok' ? 'success' : 'destructive'}>
            <p>{notice.text}</p>
            {notice.reasons ? (
              <ul className="mt-1 list-disc pl-5">
                {notice.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}
          </Alert>
        ) : null}
      </div>

      {movingSlot ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <span ref={moveHeading} tabIndex={-1} className="outline-none">
                {t('edit.moveTitle', { code: movingSlot.course.code, who: movingSlot.target.name })}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {(() => {
              const starts = checker
                .validStarts(movingSlot.id)
                .filter(
                  (c) =>
                    c.weekday !== movingSlot.weekday ||
                    c.startPeriodIndex !== movingSlot.startPeriodIndex,
                );
              return starts.length ? (
                <div className="flex flex-wrap gap-2">
                  {starts.map((c) => (
                    <Button
                      key={cellKey(c.weekday, c.startPeriodIndex)}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setMoving(null);
                        move(movingSlot, c);
                      }}
                    >
                      {t('edit.moveTo', {
                        day: t(`days.short.${c.weekday}`),
                        periods: periodsLabel(c.startPeriodIndex, movingSlot.length),
                      })}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">{t('edit.moveNone')}</p>
              );
            })()}
            <div>
              <Button type="button" variant="ghost" onClick={() => setMoving(null)}>
                {t('edit.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* While dragging: what dropping here would do, in words (not colour alone). */}
      {overSlot && overPlan ? (
        <p className="text-sm" aria-live="polite">
          {overPlan.ok
            ? t('edit.validHere')
            : `${t('edit.invalidHere')}: ${overPlan.problems.map(say).join(' ')}`}
        </p>
      ) : null}

      <div className="hidden min-w-0 md:block">
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          {/* relative: sr-only labels stay inside the scroll box (see TimetableGrid). */}
          <div className="relative overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[60rem] border-collapse text-sm">
              <caption className="sr-only">{t('grid.caption', { name: who.name })}</caption>
              <thead>
                <tr className="border-b bg-muted/50">
                  <th scope="col" className="sticky left-0 z-10 w-16 bg-muted px-2 py-2 text-left">
                    <span className="sr-only">{t('grid.day')}</span>
                  </th>
                  {columns.map((c) =>
                    c.kind === 'period' ? (
                      <th
                        key={`p${c.index}`}
                        scope="col"
                        className="px-1 py-2 text-left font-medium"
                      >
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
                    {dayCells(shown, weekday, bell).map((cell) => {
                      if (cell.kind === 'break') {
                        return (
                          <td
                            key={`b${cell.afterPeriodIndex}`}
                            className="bg-muted/60 px-0 text-center align-middle text-xs text-muted-foreground"
                          >
                            {row === 0 ? (
                              <span
                                aria-hidden
                                className="inline-block -rotate-90 whitespace-nowrap"
                              >
                                {cell.label}
                              </span>
                            ) : null}
                          </td>
                        );
                      }
                      if (cell.kind === 'free') {
                        const key = cellKey(weekday, cell.period);
                        return (
                          <DropCell key={key} id={key} state={cellState(key)}>
                            <span className="sr-only">{t('grid.free')}</span>
                          </DropCell>
                        );
                      }
                      const key = cellKey(weekday, cell.startPeriod);
                      return (
                        <DropCell key={key} id={key} state={cellState(key)} colSpan={cell.columns}>
                          <div className="flex h-full flex-col gap-1">{cell.slots.map(card)}</div>
                        </DropCell>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DndContext>
      </div>

      <div className="flex min-w-0 flex-col gap-2 md:hidden">
        <p className="text-sm text-muted-foreground">{t('edit.phoneNote')}</p>
        <DayView bell={bell} slots={shown} kind={who.kind} whoName={who.name} />
      </div>
    </div>
  );
}
