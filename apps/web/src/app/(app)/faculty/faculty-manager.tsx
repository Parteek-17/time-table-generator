'use client';

import { defaultLoad, DESIGNATIONS, EXPERIENCES, type FacultyRow } from '@slotwise/shared';
import { Badge, buttonVariants, Label, NativeSelect } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import {
  EntityForm,
  type FieldSpec,
  type Option,
  type Values,
} from '@/components/entity/entity-form';
import { AddPanel, EntityList } from '@/components/entity/entity-list';

const PATH = '/faculty';

export function FacultyManager({
  rows,
  dept,
  departments,
  canCreate,
  editable,
  availabilityEditable,
}: {
  rows: FacultyRow[];
  dept: string;
  departments: Option[];
  canCreate: boolean;
  editable: string[];
  availabilityEditable: string[];
}) {
  const t = useTranslations('faculty');
  const tEnum = useTranslations('enums');
  const tEntity = useTranslations('entity');
  const router = useRouter();
  const filterId = useId();
  const experienced = defaultLoad('experienced');
  const fresher = defaultLoad('fresher');
  const fields: FieldSpec[] = [
    { name: 'name', label: t('name'), type: 'text', placeholder: 'Dr. Asha Verma' },
    { name: 'employeeCode', label: t('employeeCode'), type: 'text', half: true },
    {
      name: 'shortCode',
      label: t('shortCode'),
      hint: t('shortCodeHint'),
      type: 'text',
      half: true,
    },
    {
      name: 'designation',
      label: t('designation'),
      type: 'select',
      half: true,
      options: DESIGNATIONS.map((d) => ({ value: d, label: tEnum(`designation.${d}`) })),
    },
    {
      name: 'experience',
      label: t('experience'),
      type: 'select',
      half: true,
      options: EXPERIENCES.map((e) => ({ value: e, label: tEnum(`experience.${e}`) })),
    },
    {
      name: 'homeDepartmentId',
      label: t('homeDepartment'),
      type: 'select',
      half: true,
      options: departments,
    },
    { name: 'email', label: t('email'), type: 'email', half: true, optional: true },
    {
      name: 'departmentIds',
      label: t('alsoTeaches'),
      hint: t('alsoTeachesHint'),
      type: 'multiselect',
      options: departments,
    },
    {
      name: 'maxPeriodsPerDay',
      label: t('perDay'),
      type: 'number',
      half: true,
      min: 0,
      max: 16,
      hint: t('loadHint', {
        exDay: experienced.maxPeriodsPerDay,
        exWeek: experienced.maxPeriodsPerWeek,
        frDay: fresher.maxPeriodsPerDay,
        frWeek: fresher.maxPeriodsPerWeek,
      }),
    },
    { name: 'maxPeriodsPerWeek', label: t('perWeek'), type: 'number', half: true, min: 0, max: 80 },
  ];
  const live = rows.filter((r) => !r.archivedAt && editable.includes(r.id));

  return (
    <>
      <div className="flex flex-col gap-2 sm:max-w-sm">
        <Label htmlFor={filterId}>{t('filterDept')}</Label>
        <NativeSelect
          id={filterId}
          value={dept}
          onChange={(e) => router.push(e.target.value ? `?dept=${e.target.value}` : '?')}
        >
          <option value="">{t('allDepartments')}</option>
          {departments.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-wrap gap-3">
        {canCreate ? (
          <AddPanel label={t('add')}>
            {(close) => (
              <EntityForm
                fields={fields}
                initial={{
                  name: '',
                  employeeCode: '',
                  shortCode: '',
                  email: null,
                  designation: 'assistant_professor',
                  experience: 'fresher',
                  homeDepartmentId: dept,
                  departmentIds: [],
                  ...fresher,
                }}
                path={PATH}
                id={null}
                revalidate={PATH}
                submitLabel={tEntity('add')}
                onCancel={close}
              />
            )}
          </AddPanel>
        ) : null}
        {live.length > 1 ? (
          <AddPanel label={t('bulkTitle')}>
            {(close) => (
              <EntityForm
                fields={[
                  {
                    name: 'facultyIds',
                    label: t('bulkWho'),
                    type: 'multiselect',
                    options: live.map((f) => ({
                      value: f.id,
                      label: `${f.shortCode} · ${f.name}`,
                    })),
                  },
                  {
                    name: 'maxPeriodsPerDay',
                    label: t('perDay'),
                    hint: t('bulkBlankKeeps'),
                    type: 'number',
                    half: true,
                    optional: true,
                    min: 0,
                    max: 16,
                  },
                  {
                    name: 'maxPeriodsPerWeek',
                    label: t('perWeek'),
                    type: 'number',
                    half: true,
                    optional: true,
                    min: 0,
                    max: 80,
                  },
                ]}
                initial={{ facultyIds: [], maxPeriodsPerDay: null, maxPeriodsPerWeek: null }}
                path="/faculty/bulk-load"
                id={null}
                revalidate={PATH}
                submitLabel={t('bulkApply')}
                onSaved={close}
                onCancel={close}
              />
            )}
          </AddPanel>
        ) : null}
      </div>
      <EntityList
        rows={rows}
        path={PATH}
        revalidate={PATH}
        name={(r) => r.name}
        title={(r) => `${r.name} (${r.shortCode})`}
        subtitle={(r) => (
          <span className="flex flex-wrap items-center gap-1">
            <span>
              {tEnum(`designation.${r.designation}`)} · {r.homeDepartmentCode} ·{' '}
              {t('limits', { day: r.maxPeriodsPerDay, week: r.maxPeriodsPerWeek })}
            </span>
            {r.experience === 'fresher' ? <Badge>{tEnum('experience.fresher')}</Badge> : null}
            {r.unavailableCount > 0 ? (
              <Badge>{t('blocked', { count: r.unavailableCount })}</Badge>
            ) : null}
            {r.departmentIds.length > 0 ? (
              <Badge>
                {t('alsoIn', {
                  list: r.departmentIds
                    .map((d) => departments.find((o) => o.value === d)?.label ?? '?')
                    .join(', '),
                })}
              </Badge>
            ) : null}
          </span>
        )}
        searchText={(r) => `${r.name} ${r.shortCode} ${r.employeeCode}`}
        canEdit={(r) => editable.includes(r.id)}
        empty={t('empty')}
        actions={(r) =>
          r.archivedAt ? null : (
            <Link
              href={`/faculty/${r.id}/availability`}
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
            >
              {availabilityEditable.includes(r.id) ? t('availability') : t('viewAvailability')}
            </Link>
          )
        }
        edit={(r, close) => (
          <EntityForm
            fields={fields}
            initial={r as unknown as Values}
            path={PATH}
            id={r.id}
            revalidate={PATH}
            submitLabel={tEntity('save')}
            onSaved={close}
            onCancel={close}
          />
        )}
      />
    </>
  );
}
