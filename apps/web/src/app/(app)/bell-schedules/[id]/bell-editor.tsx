'use client';

import {
  buildBellSchedule,
  formatTime,
  parseTime,
  validateBellSchedule,
  type BellScheduleInput,
} from '@slotwise/shared';
import { Alert, Button, Checkbox, Input, Label } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { ChoiceChips, type Option } from '@/components/entity/entity-form';
import { saveEntity } from '@/lib/entity-actions';

type Period = BellScheduleInput['periods'][number];
type Break = BellScheduleInput['breaks'][number];

/**
 * Builds a bell schedule: fill evenly sized periods from a start time, then adjust any
 * period. Problems (gaps, overlaps) are explained while you type.
 */
export function BellEditor({
  id,
  initial,
  programmes,
  canManage,
  stayOnSave = false,
}: {
  id: string | null;
  initial: BellScheduleInput;
  programmes: Option[];
  canManage: boolean;
  /** Refresh in place after creating instead of opening the new schedule's page (wizard). */
  stayOnSave?: boolean;
}) {
  const t = useTranslations('bell');
  const tEntity = useTranslations('entity');
  const uid = useId();
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [workingDays, setWorkingDays] = useState(initial.workingDays);
  const [isDefault, setIsDefault] = useState(initial.isDefault);
  const [periods, setPeriods] = useState<Period[]>(initial.periods);
  const [breaks, setBreaks] = useState<Break[]>(initial.breaks);
  const [overrides, setOverrides] = useState(initial.programmes);
  const [fill, setFill] = useState({
    start: formatTime(initial.periods[0]?.startMinute ?? 540),
    minutes: String(
      initial.periods[0] ? initial.periods[0].endMinute - initial.periods[0].startMinute : 50,
    ),
    count: String(initial.periods.length || 8),
  });
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, start] = useTransition();

  const problems = validateBellSchedule({ workingDays, periods, breaks });

  function refill() {
    const startMinute = parseTime(fill.start);
    const periodMinutes = Number(fill.minutes);
    const count = Number(fill.count);
    if (startMinute == null || !(periodMinutes > 0) || !(count > 0 && count <= 16)) return;
    const kept = breaks.filter((b) => b.afterPeriodIndex < count);
    setBreaks(kept);
    setPeriods(buildBellSchedule({ startMinute, periodMinutes, periodCount: count, breaks: kept }));
  }

  function setTime(index: number, field: 'startMinute' | 'endMinute', raw: string) {
    const minute = parseTime(raw);
    if (minute == null) return;
    setPeriods((ps) => ps.map((p) => (p.index === index ? { ...p, [field]: minute } : p)));
  }

  function save() {
    start(async () => {
      const res = await saveEntity<{ id: string }>(
        '/bell-schedules',
        id,
        { name, workingDays, isDefault, periods, breaks, programmes: overrides },
        '/bell-schedules',
      );
      if (res.ok) {
        setResult({ ok: true });
        if (!id && res.data) {
          if (stayOnSave) router.refresh();
          else router.replace(`/bell-schedules/${res.data.id}`);
        }
      } else {
        const details = Object.values(res.fieldErrors ?? {}).flat();
        setResult({ ok: false, message: [res.message, ...details].filter(Boolean).join(' ') });
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-name`}>{t('name')}</Label>
          <Input
            id={`${uid}-name`}
            value={name}
            disabled={!canManage}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 sm:mt-7">
          <Checkbox
            id={`${uid}-default`}
            checked={isDefault}
            disabled={!canManage}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          <Label htmlFor={`${uid}-default`}>{t('isDefault')}</Label>
        </div>
      </div>

      <fieldset disabled={!canManage}>
        <legend className="mb-2 text-sm font-medium">{t('workingDays')}</legend>
        <ChoiceChips
          options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({
            value: String(d),
            label: tEntity(`weekdayShort.${d}`),
          }))}
          selected={workingDays.map(String)}
          onChange={(sel) => setWorkingDays(sel.map(Number).sort())}
        />
      </fieldset>

      {canManage ? (
        <section
          className="flex flex-col gap-3 rounded-xl border p-4"
          aria-labelledby={`${uid}-fill`}
        >
          <h2 id={`${uid}-fill`} className="font-semibold">
            {t('fillTitle')}
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ['start', t('firstStarts'), '08:30'],
                ['minutes', t('periodMinutes'), '50'],
                ['count', t('periodCount'), '8'],
              ] as const
            ).map(([key, label, placeholder]) => (
              <div key={key} className="flex flex-col gap-2">
                <Label htmlFor={`${uid}-${key}`}>{label}</Label>
                <Input
                  id={`${uid}-${key}`}
                  inputMode="numeric"
                  placeholder={placeholder}
                  value={fill[key]}
                  onChange={(e) => setFill((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <BreaksEditor
            breaks={breaks}
            max={Number(fill.count) || periods.length}
            onChange={setBreaks}
          />
          <Button variant="outline" className="self-start" onClick={refill}>
            {t('fill')}
          </Button>
        </section>
      ) : null}

      <section className="flex flex-col gap-2" aria-labelledby={`${uid}-periods`}>
        <h2 id={`${uid}-periods`} className="font-semibold">
          {t('periods')}
        </h2>
        <ol className="flex flex-col divide-y rounded-xl border">
          {periods.map((p) => {
            const brk = breaks.find((b) => b.afterPeriodIndex === p.index);
            return (
              <li key={p.index} className="flex flex-col">
                <div className="flex flex-wrap items-center gap-3 p-3">
                  <span className="w-10 font-semibold">{p.label}</span>
                  <TimeBox
                    label={t('startsAt', { label: p.label })}
                    minute={p.startMinute}
                    disabled={!canManage}
                    onChange={(v) => setTime(p.index, 'startMinute', v)}
                  />
                  <span aria-hidden="true">–</span>
                  <TimeBox
                    label={t('endsAt', { label: p.label })}
                    minute={p.endMinute}
                    disabled={!canManage}
                    onChange={(v) => setTime(p.index, 'endMinute', v)}
                  />
                </div>
                {brk ? (
                  <p className="bg-muted px-3 py-2 text-sm">
                    {t('breakRow', { label: brk.label, minutes: brk.minutes })}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      {programmes.length > 0 ? (
        <fieldset disabled={!canManage} className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t('usedBy')}</legend>
          <p className="text-sm text-muted-foreground">{t('usedByHint')}</p>
          <ChoiceChips
            options={programmes}
            selected={overrides.map((o) => o.programmeId)}
            onChange={(sel) =>
              setOverrides(
                sel.map(
                  (programmeId) =>
                    overrides.find((o) => o.programmeId === programmeId) ?? {
                      programmeId,
                      semesters: [],
                    },
                ),
              )
            }
          />
        </fieldset>
      ) : null}

      <div aria-live="polite" className="flex flex-col gap-2">
        {problems.length > 0 ? (
          <Alert variant="destructive" role="alert">
            <p className="font-medium">{t('problems')}</p>
            <ul className="mt-1 list-disc pl-5">
              {problems.map((p) => (
                <li key={p.message}>{p.message}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        {result ? (
          <Alert variant={result.ok ? 'success' : 'destructive'}>
            {result.ok ? tEntity('saved') : result.message}
          </Alert>
        ) : null}
      </div>

      {canManage ? (
        <Button className="self-start" disabled={pending || problems.length > 0} onClick={save}>
          {pending ? tEntity('saving') : t('save')}
        </Button>
      ) : null}
    </div>
  );
}

/** HH:MM text box; keeps what you type until it is a valid time. */
function TimeBox({
  label,
  minute,
  disabled,
  onChange,
}: {
  label: string;
  minute: number;
  disabled: boolean;
  onChange: (raw: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      aria-label={label}
      className="w-24"
      inputMode="numeric"
      disabled={disabled}
      value={draft ?? formatTime(minute)}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(e.target.value);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

function BreaksEditor({
  breaks,
  max,
  onChange,
}: {
  breaks: Break[];
  max: number;
  onChange: (b: Break[]) => void;
}) {
  const t = useTranslations('bell');
  const uid = useId();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{t('breaks')}</p>
      {breaks.map((b, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${uid}-l${i}`} className="text-xs">
              {t('breakLabel')}
            </Label>
            <Input
              id={`${uid}-l${i}`}
              className="w-32"
              value={b.label}
              onChange={(e) =>
                onChange(breaks.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${uid}-a${i}`} className="text-xs">
              {t('afterPeriod')}
            </Label>
            <Input
              id={`${uid}-a${i}`}
              className="w-20"
              type="number"
              min={1}
              max={max - 1}
              value={b.afterPeriodIndex}
              onChange={(e) =>
                onChange(
                  breaks.map((x, k) =>
                    k === i ? { ...x, afterPeriodIndex: Number(e.target.value) } : x,
                  ),
                )
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${uid}-m${i}`} className="text-xs">
              {t('minutes')}
            </Label>
            <Input
              id={`${uid}-m${i}`}
              className="w-20"
              type="number"
              min={1}
              value={b.minutes}
              onChange={(e) =>
                onChange(
                  breaks.map((x, k) => (k === i ? { ...x, minutes: Number(e.target.value) } : x)),
                )
              }
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange(breaks.filter((_, k) => k !== i))}
          >
            {t('removeBreak')}
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() =>
          onChange([
            ...breaks,
            {
              label: t('newBreak'),
              afterPeriodIndex: Math.min(2, Math.max(1, max - 1)),
              minutes: 10,
            },
          ])
        }
      >
        {t('addBreak')}
      </Button>
    </div>
  );
}
