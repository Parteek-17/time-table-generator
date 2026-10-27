'use client';

import type { DisruptionDto } from '@slotwise/shared/reschedule';
import { Alert, Badge, Button } from '@slotwise/ui';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { undoDisruption } from './actions';
import { clock, day } from './format';

/** The term's holidays and events, newest first; Undo on each (no confirm). */
export function DisruptionList({
  disruptions,
  canEdit,
  names,
}: {
  disruptions: DisruptionDto[];
  canEdit: boolean;
  /** Department, section and teacher id → name, for "who". */
  names: Record<string, string>;
}) {
  const t = useTranslations('p4.disruptions');
  const tn = useTranslations('p4.notice');
  const format = useFormatter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const date = (d: string) =>
    format.dateTime(day(d), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

  if (disruptions.length === 0)
    return <p className="text-sm text-muted-foreground">{t('empty')}</p>;
  return (
    <div className="flex flex-col gap-3">
      {message ? (
        <Alert variant={message.ok ? 'success' : 'destructive'} role="status">
          {message.text}
        </Alert>
      ) : null}
      <ul className="flex flex-col gap-2">
        {disruptions.map((d) => {
          const who =
            d.kind === 'faculty_leave'
              ? (names[d.facultyId ?? ''] ?? '')
              : d.scopeType === 'institute'
                ? t('everyone')
                : (names[d.departmentId ?? d.sectionId ?? ''] ?? '');
          return (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {d.title} <Badge>{t(`kinds.${d.kind}`)}</Badge>
                </p>
                <p className="text-sm text-muted-foreground">
                  {d.startDate === d.endDate
                    ? date(d.startDate)
                    : t('dates', { from: date(d.startDate), to: date(d.endDate) })}
                  {d.startMinute !== null && d.endMinute !== null
                    ? `, ${t('hours', { from: clock(d.startMinute), to: clock(d.endMinute) })}`
                    : null}
                  {who ? ` · ${who}` : null}
                </p>
                <p className="text-sm">{t('cancelled', { count: d.cancelledCount })}</p>
              </div>
              {canEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await undoDisruption(d.id);
                      if (!res.ok) return setMessage({ ok: false, text: res.message });
                      const kept = res.result.keptByOther;
                      setMessage({
                        ok: true,
                        text: `${d.title}: ${tn('undone', { count: res.result.restored })}${
                          kept > 0 ? ` ${tn('keptByOther', { count: kept })}` : ''
                        }`,
                      });
                    })
                  }
                >
                  {t('undo')}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
