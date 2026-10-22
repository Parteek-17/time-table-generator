'use client';

import {
  CALENDAR_WINDOW_TYPES,
  weekdayOf,
  type CalendarWindowRow,
  type ExtraWorkingDayRow,
  type HolidayPasteResultDto,
  type HolidayRow,
} from '@slotwise/shared';
import { Alert, Button, Label, Textarea } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useId, useState, useTransition } from 'react';
import { EntityForm, type FieldSpec, type Values } from '@/components/entity/entity-form';
import { AddPanel, EntityList } from '@/components/entity/entity-list';
import {
  institutionScope,
  scopeFields,
  scopeLabel,
  type ScopeOptions,
} from '@/components/entity/scope-fields';
import { sendToApi } from '@/lib/entity-actions';

const REVALIDATE = '/calendar';

export function CalendarManager({
  termId,
  holidays,
  windows,
  extraDays,
  canManage,
  scope,
}: {
  termId: string;
  holidays: HolidayRow[];
  windows: CalendarWindowRow[];
  extraDays: ExtraWorkingDayRow[];
  canManage: boolean;
  scope: ScopeOptions;
}) {
  const t = useTranslations('calendar');
  const tEnum = useTranslations('enums');
  const tEntity = useTranslations('entity');
  const scopeSpec = scopeFields(scope, t, tEnum);
  const where = (r: {
    scopeType: string;
    departmentId: string | null;
    programmeId: string | null;
    cohortId: string | null;
  }) => scopeLabel(r, scope, t('wholeInstitute'));
  const range = (r: { startDate: string; endDate: string }) =>
    r.startDate === r.endDate ? r.startDate : `${r.startDate} – ${r.endDate}`;

  const holidayFields: FieldSpec[] = [
    { name: 'name', label: t('holidayName'), type: 'text', placeholder: 'Diwali break' },
    { name: 'startDate', label: t('from'), type: 'date', half: true },
    { name: 'endDate', label: t('to'), type: 'date', half: true },
    ...scopeSpec,
  ];
  const windowFields: FieldSpec[] = [
    {
      name: 'type',
      label: t('windowType'),
      type: 'select',
      half: true,
      options: CALENDAR_WINDOW_TYPES.map((w) => ({ value: w, label: tEnum(`windowType.${w}`) })),
    },
    {
      name: 'label',
      label: t('windowLabel'),
      type: 'text',
      half: true,
      placeholder: 'Mid-semester test 1',
    },
    { name: 'startDate', label: t('from'), type: 'date', half: true },
    { name: 'endDate', label: t('to'), type: 'date', half: true },
    ...scopeSpec,
  ];
  const dayFields: FieldSpec[] = [
    { name: 'date', label: t('date'), type: 'date', half: true },
    {
      name: 'followsWeekday',
      label: t('followsWeekday'),
      hint: t('followsWeekdayHint'),
      type: 'select',
      half: true,
      numeric: true,
      options: [1, 2, 3, 4, 5, 6].map((d) => ({
        value: String(d),
        label: tEntity(`weekday.${d}`),
      })),
    },
    ...scopeSpec,
  ];
  const dayInitial = (r?: ExtraWorkingDayRow): Values =>
    r ? (r as unknown as Values) : { termId, date: '', followsWeekday: 1, ...institutionScope };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3" aria-labelledby="holidays-heading">
        <h2 id="holidays-heading" className="text-lg font-semibold">
          {t('holidays')}
        </h2>
        {canManage ? <PasteHolidays /> : null}
        {canManage ? (
          <AddPanel label={t('addHoliday')}>
            {(close) => (
              <EntityForm
                fields={holidayFields}
                initial={{ name: '', startDate: '', endDate: '', ...institutionScope }}
                path="/holidays"
                id={null}
                revalidate={REVALIDATE}
                submitLabel={tEntity('add')}
                onCancel={close}
              />
            )}
          </AddPanel>
        ) : null}
        <EntityList
          rows={holidays}
          path="/holidays"
          revalidate={REVALIDATE}
          name={(r) => r.name}
          title={(r) => r.name}
          subtitle={(r) => `${range(r)} · ${where(r)}`}
          canEdit={() => canManage}
          empty={t('noHolidays')}
          edit={(r, close) => (
            <EntityForm
              fields={holidayFields}
              initial={r as unknown as Values}
              path="/holidays"
              id={r.id}
              revalidate={REVALIDATE}
              submitLabel={tEntity('save')}
              onSaved={close}
              onCancel={close}
            />
          )}
        />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="windows-heading">
        <h2 id="windows-heading" className="text-lg font-semibold">
          {t('windows')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('windowsHint')}</p>
        {canManage ? (
          <AddPanel label={t('addWindow')}>
            {(close) => (
              <EntityForm
                fields={windowFields}
                initial={{
                  termId,
                  type: 'mid_sem_exam',
                  label: '',
                  startDate: '',
                  endDate: '',
                  ...institutionScope,
                }}
                path="/calendar-windows"
                id={null}
                revalidate={REVALIDATE}
                submitLabel={tEntity('add')}
                onCancel={close}
              />
            )}
          </AddPanel>
        ) : null}
        <EntityList
          rows={windows}
          path="/calendar-windows"
          revalidate={REVALIDATE}
          name={(r) => r.label}
          title={(r) => r.label}
          subtitle={(r) => `${tEnum(`windowType.${r.type}`)} · ${range(r)} · ${where(r)}`}
          canEdit={() => canManage}
          empty={t('noWindows')}
          edit={(r, close) => (
            <EntityForm
              fields={windowFields}
              initial={r as unknown as Values}
              path="/calendar-windows"
              id={r.id}
              revalidate={REVALIDATE}
              submitLabel={tEntity('save')}
              onSaved={close}
              onCancel={close}
            />
          )}
        />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="days-heading">
        <h2 id="days-heading" className="text-lg font-semibold">
          {t('extraDays')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('extraDaysHint')}</p>
        {canManage ? (
          <AddPanel label={t('addExtraDay')}>
            {(close) => (
              <EntityForm
                fields={dayFields}
                initial={dayInitial()}
                path="/extra-working-days"
                id={null}
                revalidate={REVALIDATE}
                submitLabel={tEntity('add')}
                onCancel={close}
              />
            )}
          </AddPanel>
        ) : null}
        <EntityList
          rows={extraDays}
          path="/extra-working-days"
          revalidate={REVALIDATE}
          name={(r) => r.date}
          title={(r) => `${tEntity(`weekday.${weekdayOf(r.date)}`)} ${r.date}`}
          subtitle={(r) =>
            `${t('follows', { day: tEntity(`weekday.${r.followsWeekday}`) })} · ${where(r)}`
          }
          canEdit={() => canManage}
          empty={t('noExtraDays')}
          edit={(r, close) => (
            <EntityForm
              fields={dayFields}
              initial={dayInitial(r)}
              path="/extra-working-days"
              id={r.id}
              revalidate={REVALIDATE}
              submitLabel={tEntity('save')}
              onSaved={close}
              onCancel={close}
            />
          )}
        />
      </section>
    </div>
  );
}

/** Paste many holidays at once: "2026-10-20, Dussehra" per line, ranges with "to". */
function PasteHolidays() {
  const t = useTranslations('calendar');
  const id = useId();
  const [text, setText] = useState('');
  const [result, setResult] = useState<{
    created?: number;
    errors?: HolidayPasteResultDto['errors'];
    message?: string;
  } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-4">
      <Label htmlFor={id}>{t('pasteLabel')}</Label>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {t('pasteHint')}
      </p>
      <Textarea
        id={id}
        aria-describedby={`${id}-hint`}
        value={text}
        placeholder={'2026-10-20, Dussehra\n2026-11-09 to 2026-11-10, Diwali break'}
        onChange={(e) => setText(e.target.value)}
      />
      <Button
        className="self-start"
        disabled={pending || !text.trim()}
        onClick={() =>
          start(async () => {
            const res = await sendToApi<HolidayPasteResultDto>(
              'POST',
              '/holidays/paste',
              { text, ...institutionScope },
              REVALIDATE,
            );
            if (!res.ok || !res.data) {
              setResult({ message: res.message });
              return;
            }
            setResult(res.data);
            // Keep only the lines that need fixing.
            setText(res.data.errors.map((e) => e.text).join('\n'));
          })
        }
      >
        {pending ? t('adding') : t('pasteAdd')}
      </Button>
      <div aria-live="polite">
        {result?.message ? <Alert variant="destructive">{result.message}</Alert> : null}
        {result?.created != null ? (
          <Alert variant={result.errors?.length ? 'default' : 'success'}>
            <p>{t('pasteResult', { count: result.created })}</p>
            {result.errors?.length ? (
              <ul className="mt-2 list-disc pl-5">
                {result.errors.map((e) => (
                  <li key={e.line}>{t('pasteLineError', { line: e.line, message: e.message })}</li>
                ))}
              </ul>
            ) : null}
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
