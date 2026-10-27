'use client';

import { FIXED_SLOT_KINDS, type FixedSlotRow } from '@slotwise/shared';
import { useTranslations } from 'next-intl';
import {
  EntityForm,
  type FieldSpec,
  type Option,
  type Values,
} from '@/components/entity/entity-form';
import { AddPanel, EntityList } from '@/components/entity/entity-list';
import {
  institutionScope,
  scopeFields,
  scopeLabel,
  type ScopeOptions,
} from '@/components/entity/scope-fields';

const PATH = '/fixed-slots';
const REVALIDATE = '/teaching/fixed-slots';

export function FixedSlotsManager({
  termId,
  slots,
  workingDays,
  periods,
  faculty,
  canManage,
  scope,
}: {
  termId: string;
  slots: FixedSlotRow[];
  workingDays: number[];
  periods: { index: number; label: string }[];
  faculty: Option[];
  canManage: boolean;
  scope: ScopeOptions;
}) {
  const t = useTranslations('p1.fixedSlots');
  const tCalendar = useTranslations('calendar');
  const tEnum = useTranslations('enums');
  const tEntity = useTranslations('entity');
  const periodOptions = periods.map((p) => ({ value: String(p.index), label: p.label }));
  const periodLabel = (i: number) => periods.find((p) => p.index === i)?.label ?? `P${i}`;

  const fields: FieldSpec[] = [
    {
      name: 'kind',
      label: t('kind'),
      type: 'select',
      half: true,
      options: FIXED_SLOT_KINDS.map((k) => ({ value: k, label: tEnum(`fixedSlotKind.${k}`) })),
    },
    { name: 'label', label: t('label'), type: 'text', half: true, placeholder: 'Mentoring hour' },
    {
      name: 'weekday',
      label: t('weekday'),
      type: 'select',
      numeric: true,
      options: workingDays.map((d) => ({ value: String(d), label: tEntity(`weekday.${d}`) })),
    },
    {
      name: 'startPeriodIndex',
      label: t('from'),
      type: 'select',
      half: true,
      numeric: true,
      options: periodOptions,
    },
    {
      name: 'endPeriodIndex',
      label: t('to'),
      type: 'select',
      half: true,
      numeric: true,
      options: periodOptions,
    },
    ...scopeFields(scope, tCalendar, tEnum),
    {
      name: 'facultyIds',
      label: t('faculty'),
      hint: t('facultyHint'),
      type: 'multiselect',
      options: faculty,
    },
  ];
  const last = periods.at(-1)?.index ?? 1;
  const initial: Values = {
    termId,
    kind: 'mentoring',
    label: '',
    weekday: workingDays[0] ?? 1,
    startPeriodIndex: last,
    endPeriodIndex: last,
    facultyIds: [],
    ...institutionScope,
  };
  const when = (r: FixedSlotRow) =>
    t('when', {
      day: tEntity(`weekday.${r.weekday}`),
      periods:
        r.startPeriodIndex === r.endPeriodIndex
          ? periodLabel(r.startPeriodIndex)
          : `${periodLabel(r.startPeriodIndex)}–${periodLabel(r.endPeriodIndex)}`,
    });

  return (
    <div className="flex flex-col gap-3">
      {canManage ? (
        <AddPanel label={t('add')}>
          {(close) => (
            <EntityForm
              fields={fields}
              initial={initial}
              path={PATH}
              id={null}
              revalidate={REVALIDATE}
              submitLabel={tEntity('add')}
              onCancel={close}
            />
          )}
        </AddPanel>
      ) : (
        <p className="text-sm text-muted-foreground">{t('notAllowed')}</p>
      )}
      <EntityList
        rows={slots}
        path={PATH}
        revalidate={REVALIDATE}
        name={(r) => r.label}
        title={(r) => `${r.label} · ${tEnum(`fixedSlotKind.${r.kind}`)}`}
        subtitle={(r) =>
          [
            when(r),
            scopeLabel(r, scope, tCalendar('wholeInstitute')),
            r.facultyIds.length > 0 ? t('teachers', { count: r.facultyIds.length }) : null,
          ]
            .filter(Boolean)
            .join(' · ')
        }
        canEdit={() => canManage}
        empty={t('none')}
        edit={(r, close) => (
          <EntityForm
            fields={fields}
            initial={r as unknown as Values}
            path={PATH}
            id={r.id}
            revalidate={REVALIDATE}
            submitLabel={tEntity('save')}
            onSaved={close}
            onCancel={close}
          />
        )}
      />
    </div>
  );
}
