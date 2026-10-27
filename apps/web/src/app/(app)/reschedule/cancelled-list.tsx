'use client';

import type { CancellationDto, MakeUpOption } from '@slotwise/shared/reschedule';
import { Alert, Button } from '@slotwise/ui';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { bookMakeUp, makeUpOptions, removeMakeUp } from './actions';
import { clock, day, periods } from './format';

/** Cancelled classes from today on, by date, each with its make-up or a way to find one. */
export function CancelledList({
  cancellations,
  canEdit,
}: {
  cancellations: CancellationDto[];
  canEdit: boolean;
}) {
  const t = useTranslations('p4.cancelled');
  if (cancellations.length === 0)
    return <p className="text-sm text-muted-foreground">{t('empty')}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {cancellations.map((c) => (
        <CancelledClass key={c.id} c={c} canEdit={canEdit} />
      ))}
    </ul>
  );
}

function CancelledClass({ c, canEdit }: { c: CancellationDto; canEdit: boolean }) {
  const t = useTranslations('p4.cancelled');
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<MakeUpOption[] | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  /** The make-up just removed, so Undo can book it again. */
  const [removed, setRemoved] = useState<MakeUpOption | null>(null);
  const [pending, startTransition] = useTransition();
  const date = (d: string) =>
    format.dateTime(day(d), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const { slot, makeUp } = c;

  const find = () =>
    startTransition(async () => {
      setOpen(true);
      setMessage(null);
      setOptions(null);
      const res = await makeUpOptions(c.id);
      if (!res.ok) return setMessage({ ok: false, text: res.message });
      setOptions(res.result.options);
      if (res.result.problem) setMessage({ ok: false, text: res.result.problem });
    });

  const book = (o: Pick<MakeUpOption, 'date' | 'startPeriodIndex' | 'roomId'>) =>
    startTransition(async () => {
      const res = await bookMakeUp(c.id, {
        date: o.date,
        startPeriodIndex: o.startPeriodIndex,
        roomId: o.roomId,
      });
      if (!res.ok) return setMessage({ ok: false, text: res.message });
      setOpen(false);
      setRemoved(null);
      setMessage({ ok: true, text: t('booked') });
    });

  const remove = () =>
    startTransition(async () => {
      if (!makeUp) return;
      const res = await removeMakeUp(makeUp.id);
      if (!res.ok) return setMessage({ ok: false, text: res.message });
      setRemoved({
        date: makeUp.date,
        week: 'same',
        startPeriodIndex: makeUp.startPeriodIndex,
        length: makeUp.length,
        startMinute: makeUp.startMinute,
        endMinute: makeUp.endMinute,
        periodLabel: periods(makeUp.startPeriodIndex, makeUp.length),
        roomId: makeUp.roomId,
        roomCode: makeUp.roomCode ?? '',
      });
      setMessage({ ok: true, text: t('removed') });
    });

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {slot.course.code} {slot.course.shortName} · {slot.target.name}
          </p>
          <p className="text-sm text-muted-foreground">
            {date(c.date)},{' '}
            {t('time', {
              period: periods(slot.startPeriodIndex, slot.length),
              from: clock(slot.startMinute),
              to: clock(slot.endMinute),
            })}
            {slot.faculty.length > 0 ? ` · ${slot.faculty.map((f) => f.name).join(', ')}` : null}
          </p>
          <p className="text-sm">{c.reason}</p>
          <p className="text-sm">
            {makeUp
              ? t('makeUp', {
                  date: date(makeUp.date),
                  period: periods(makeUp.startPeriodIndex, makeUp.length),
                  room: makeUp.roomCode ?? '',
                })
              : t('noMakeUp')}
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={makeUp ? 'outline' : 'default'}
              className="min-h-11"
              disabled={pending}
              onClick={open ? () => setOpen(false) : find}
              aria-expanded={open}
            >
              {open ? t('hide') : makeUp ? t('move') : t('find')}
            </Button>
            {makeUp ? (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                disabled={pending}
                onClick={remove}
              >
                {t('removeMakeUp')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {message ? (
        <Alert
          variant={message.ok ? 'success' : 'destructive'}
          role="status"
          className="flex flex-wrap items-center gap-3"
        >
          <span>{message.text}</span>
          {removed ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => book(removed)}
            >
              {t('undo')}
            </Button>
          ) : null}
        </Alert>
      ) : null}

      {open ? (
        pending && !options ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t('finding')}
          </p>
        ) : options && options.length > 0 ? (
          <ul className="flex flex-col gap-1.5" aria-label={t('find')}>
            {options.map((o) => (
              <li
                key={`${o.date}-${o.startPeriodIndex}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 p-2"
              >
                <span className="text-sm">
                  <span className="font-medium">
                    {o.week === 'same' ? t('sameWeek') : t('nextWeek')}:
                  </span>{' '}
                  {t('option', { date: date(o.date), period: o.periodLabel, room: o.roomCode })}
                </span>
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={pending}
                  onClick={() => book(o)}
                >
                  {t('book')}
                </Button>
              </li>
            ))}
          </ul>
        ) : null
      ) : null}
    </li>
  );
}
