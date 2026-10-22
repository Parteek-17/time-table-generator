'use client';

import {
  COURSE_TYPES,
  credits,
  formatLtp,
  GROUPED_BY,
  ROOM_TYPES,
  type CourseRow,
} from '@slotwise/shared';
import { Badge } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import {
  EntityForm,
  type FieldSpec,
  type Option,
  type Values,
} from '@/components/entity/entity-form';
import { AddPanel, EntityList } from '@/components/entity/entity-list';

const PATH = '/courses';
const isElective = (v: Values) => v.type === 'programme_elective' || v.type === 'open_elective';
const hasPracticals = (v: Values) => Number(v.practicals) > 0;

export function CoursesManager({
  rows,
  schemeVersionId,
  semester,
  revalidate,
  branches,
  departments,
  canCreate,
  editable,
}: {
  rows: CourseRow[];
  schemeVersionId: string;
  semester: number;
  revalidate: string;
  branches: Option[];
  departments: Option[];
  canCreate: boolean;
  editable: string[];
}) {
  const t = useTranslations('courses');
  const tEnum = useTranslations('enums');
  const tEntity = useTranslations('entity');
  const total = rows
    .filter((r) => !r.archivedAt && r.isScheduled)
    .reduce((a, r) => a + r.lectures + r.tutorials + r.practicals, 0);

  const fields: FieldSpec[] = [
    { name: 'code', label: t('code'), type: 'text', half: true, placeholder: 'CS201' },
    { name: 'shortName', label: t('shortName'), type: 'text', half: true, placeholder: 'DS' },
    { name: 'title', label: t('titleField'), type: 'text', placeholder: 'Data Structures' },
    { name: 'lectures', label: t('lectures'), type: 'number', half: true, min: 0, max: 20 },
    { name: 'tutorials', label: t('tutorials'), type: 'number', half: true, min: 0, max: 20 },
    { name: 'practicals', label: t('practicals'), type: 'number', half: true, min: 0, max: 20 },
    {
      name: 'creditsOverride',
      label: t('creditsOverride'),
      hint: t('creditsHint'),
      type: 'number',
      half: true,
      optional: true,
      step: 0.5,
    },
    {
      name: 'type',
      label: t('type'),
      type: 'select',
      half: true,
      options: COURSE_TYPES.map((c) => ({ value: c, label: tEnum(`courseType.${c}`) })),
    },
    {
      name: 'electiveGroup',
      label: t('electiveGroup'),
      hint: t('electiveGroupHint'),
      type: 'text',
      half: true,
      optional: true,
      show: isElective,
    },
    {
      name: 'offeringDepartmentId',
      label: t('offeringDepartment'),
      hint: t('offeringDepartmentHint'),
      type: 'select',
      half: true,
      options: departments,
    },
    {
      name: 'syllabusHours',
      label: t('syllabusHours'),
      type: 'number',
      half: true,
      optional: true,
    },
    ...(branches.length > 0
      ? [
          {
            name: 'branchIds',
            label: t('branches'),
            hint: t('branchesHint'),
            type: 'multiselect',
            options: branches,
          } as FieldSpec,
        ]
      : []),
    {
      name: 'tutorialBy',
      label: t('tutorialBy'),
      type: 'select',
      half: true,
      options: GROUPED_BY.map((g) => ({ value: g, label: tEnum(`groupedBy.${g}`) })),
      show: (v) => Number(v.tutorials) > 0,
    },
    {
      name: 'practicalBy',
      label: t('practicalBy'),
      type: 'select',
      half: true,
      options: GROUPED_BY.map((g) => ({ value: g, label: tEnum(`groupedBy.${g}`) })),
      show: hasPracticals,
    },
    {
      name: 'roomType',
      label: t('roomType'),
      type: 'select',
      half: true,
      optional: true,
      emptyLabel: t('roomTypeDefault'),
      options: ROOM_TYPES.map((r) => ({ value: r, label: tEnum(`roomType.${r}`) })),
      show: hasPracticals,
    },
    {
      name: 'labCategory',
      label: t('labCategory'),
      hint: t('labCategoryHint'),
      type: 'text',
      half: true,
      optional: true,
      show: hasPracticals,
    },
    {
      name: 'labBlockLength',
      label: t('labBlockLength'),
      type: 'number',
      half: true,
      min: 1,
      max: 4,
      show: hasPracticals,
    },
    { name: 'isScheduled', label: t('isScheduled'), hint: t('isScheduledHint'), type: 'checkbox' },
  ];

  const blank: Values = {
    schemeVersionId,
    semester,
    code: '',
    title: '',
    shortName: '',
    lectures: 3,
    tutorials: 0,
    practicals: 0,
    creditsOverride: null,
    syllabusHours: null,
    type: 'core',
    electiveGroup: null,
    offeringDepartmentId: '',
    roomType: null,
    labCategory: null,
    labBlockLength: 2,
    isScheduled: true,
    tutorialBy: 'subgroup',
    practicalBy: 'subgroup',
    branchIds: [],
  };

  return (
    <>
      <p className="text-sm text-muted-foreground">{t('weekTotal', { periods: total })}</p>
      {canCreate ? (
        <AddPanel label={t('add', { semester })}>
          {(close) => (
            <EntityForm
              fields={fields}
              initial={blank}
              path={PATH}
              id={null}
              revalidate={revalidate}
              submitLabel={tEntity('add')}
              onCancel={close}
            />
          )}
        </AddPanel>
      ) : null}
      <EntityList
        rows={rows}
        path={PATH}
        revalidate={revalidate}
        name={(r) => r.code}
        title={(r) => `${r.code} · ${r.title}`}
        subtitle={(r) => (
          <span className="flex flex-wrap items-center gap-1">
            <span>
              {t('ltpLine', { ltp: formatLtp(r), credits: credits(r) })} ·{' '}
              {r.offeringDepartmentCode}
            </span>
            {r.type !== 'core' ? <Badge>{tEnum(`courseType.${r.type}`)}</Badge> : null}
            {r.electiveGroup ? <Badge>{r.electiveGroup}</Badge> : null}
            {!r.isScheduled ? <Badge>{t('notTimetabled')}</Badge> : null}
            {r.branchIds.length > 0 ? (
              <Badge>
                {r.branchIds
                  .map((b) => branches.find((o) => o.value === b)?.label ?? '?')
                  .join(', ')}
              </Badge>
            ) : null}
          </span>
        )}
        searchText={(r) => `${r.code} ${r.title} ${r.shortName}`}
        canEdit={(r) => editable.includes(r.id)}
        empty={t('empty', { semester })}
        edit={(r, close) => (
          <EntityForm
            fields={fields}
            initial={r as unknown as Values}
            path={PATH}
            id={r.id}
            revalidate={revalidate}
            submitLabel={tEntity('save')}
            onSaved={close}
            onCancel={close}
          />
        )}
      />
    </>
  );
}
