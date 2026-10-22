'use client';

import { formatTime, type AvailabilityDto } from '@slotwise/shared';
import { Alert, Button, cn, Label, NativeSelect } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useId, useState, useTransition } from 'react';
import { sendToApi } from '@/lib/entity-actions';

const key = (day: number, period: number) => `${day}:${period}`;

/**
 * Day × period grid. Tap a cell to mark it unavailable (tap again to free it), or copy one
 * day's pattern to the other days. Saved together with one button.
 */
export function AvailabilityGrid({
  availability,
  canEdit,
  revalidate,
}: {
  availability: AvailabilityDto;
  canEdit: boolean;
  revalidate: string;
}) {
  const t = useTranslations('availability');
  const tEntity = useTranslations('entity');
  const copyId = useId();
  const [blocked, setBlocked] = useState(
    () => new Set(availability.unavailable.map((c) => key(c.weekday, c.periodIndex))),
  );
  const [copyFrom, setCopyFrom] = useState(String(availability.workingDays[0] ?? 1));
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const { workingDays: days, periods } = availability;

  const toggle = (day: number, period: number) => {
    setBlocked((b) => {
      const next = new Set(b);
      const k = key(day, period);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
    setDirty(true);
  };

  const copyDay = () => {
    const from = Number(copyFrom);
    setBlocked((b) => {
      const next = new Set([...b].filter((k) => k.startsWith(`${from}:`)));
      for (const d of days) {
        if (d === from) continue;
        for (const p of periods) if (b.has(key(from, p.index))) next.add(key(d, p.index));
      }
      return next;
    });
    setDirty(true);
  };

  const save = () =>
    start(async () => {
      const unavailable = [...blocked].map((k) => {
        const [weekday, periodIndex] = k.split(':').map(Number);
        return { weekday: weekday!, periodIndex: periodIndex! };
      });
      const res = await sendToApi(
        'PUT',
        `/faculty/${availability.facultyId}/availability`,
        { unavailable },
        revalidate,
      );
      setMessage(
        res.ok
          ? { text: t('saved', { count: unavailable.length }) }
          : { text: res.message ?? '', error: true },
      );
      if (res.ok) setDirty(false);
    });

  if (periods.length === 0) return <p className="text-muted-foreground">{t('noBell')}</p>;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{canEdit ? t('howTo') : t('readOnly')}</p>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{t('caption', { name: availability.name })}</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 bg-background p-2 text-left">
                {t('day')}
              </th>
              {periods.map((p) => (
                <th key={p.index} scope="col" className="p-2 text-center font-medium">
                  <span className="block">{p.label}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {formatTime(p.startMinute)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d} className="border-t">
                <th scope="row" className="sticky left-0 bg-background p-2 text-left font-medium">
                  {tEntity(`weekdayShort.${d}`)}
                </th>
                {periods.map((p) => {
                  const off = blocked.has(key(d, p.index));
                  const label = t(off ? 'cellBlocked' : 'cellFree', {
                    day: tEntity(`weekday.${d}`),
                    period: p.label,
                  });
                  return (
                    <td key={p.index} className="p-1 text-center">
                      <button
                        type="button"
                        disabled={!canEdit}
                        aria-pressed={off}
                        aria-label={label}
                        title={label}
                        onClick={() => toggle(d, p.index)}
                        className={cn(
                          'h-11 w-full min-w-11 rounded-md border text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          off
                            ? 'border-destructive bg-destructive/15 text-destructive'
                            : 'bg-success/10 text-success',
                        )}
                      >
                        {off ? t('off') : t('free')}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={copyId}>{t('copyFrom')}</Label>
              <NativeSelect
                id={copyId}
                value={copyFrom}
                onChange={(e) => setCopyFrom(e.target.value)}
              >
                {days.map((d) => (
                  <option key={d} value={d}>
                    {tEntity(`weekday.${d}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button variant="outline" onClick={copyDay}>
              {t('copyToAll')}
            </Button>
          </div>
          <div aria-live="polite">
            {message ? (
              <Alert variant={message.error ? 'destructive' : 'success'}>{message.text}</Alert>
            ) : null}
          </div>
          <Button className="self-start" onClick={save} disabled={pending || !dirty}>
            {pending ? tEntity('saving') : t('save')}
          </Button>
        </>
      ) : null}
    </div>
  );
}
