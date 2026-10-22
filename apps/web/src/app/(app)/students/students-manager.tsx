'use client';

import { STUDENT_STATUSES, type StudentRow } from '@slotwise/shared';
import { Label, NativeSelect } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import {
  EntityForm,
  type FieldSpec,
  type Option,
  type Values,
} from '@/components/entity/entity-form';
import { AddPanel, EntityList } from '@/components/entity/entity-list';

const PATH = '/students';

export function StudentsManager({
  rows,
  batch,
  batches,
  sections,
  subGroups,
  canCreate,
  editable,
}: {
  rows: StudentRow[];
  batch: string;
  batches: Option[];
  sections: Option[];
  subGroups: Option[];
  canCreate: boolean;
  editable: string[];
}) {
  const t = useTranslations('students');
  const tEnum = useTranslations('enums');
  const tEntity = useTranslations('entity');
  const router = useRouter();
  const filterId = useId();
  const fields: FieldSpec[] = [
    { name: 'batchId', label: t('batch'), type: 'select', options: batches },
    { name: 'classRollNo', label: t('classRollNo'), type: 'text', half: true },
    {
      name: 'universityRollNo',
      label: t('universityRollNo'),
      type: 'text',
      half: true,
      optional: true,
    },
    { name: 'name', label: t('name'), type: 'text' },
    { name: 'email', label: t('email'), type: 'email', half: true, optional: true },
    { name: 'phone', label: t('phone'), type: 'text', half: true, optional: true },
    {
      name: 'sectionId',
      label: t('section'),
      type: 'select',
      half: true,
      optional: true,
      options: sections,
    },
    {
      name: 'subGroupId',
      label: t('subGroup'),
      type: 'select',
      half: true,
      optional: true,
      options: subGroups,
    },
    {
      name: 'status',
      label: t('status'),
      type: 'select',
      half: true,
      options: STUDENT_STATUSES.map((s) => ({ value: s, label: tEnum(`studentStatus.${s}`) })),
    },
  ];
  return (
    <>
      <p className="text-sm text-muted-foreground">{t('optional')}</p>
      <div className="flex flex-col gap-2 sm:max-w-sm">
        <Label htmlFor={filterId}>{t('filterBatch')}</Label>
        <NativeSelect
          id={filterId}
          value={batch}
          onChange={(e) => router.push(e.target.value ? `?batch=${e.target.value}` : '?')}
        >
          <option value="">{t('allBatches')}</option>
          {batches.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {canCreate ? (
        <AddPanel label={t('add')}>
          {(close) => (
            <EntityForm
              fields={fields}
              initial={{
                batchId: batch,
                classRollNo: '',
                universityRollNo: null,
                name: '',
                email: null,
                phone: null,
                sectionId: null,
                subGroupId: null,
                status: 'active',
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
      <EntityList
        rows={rows}
        path={PATH}
        revalidate={PATH}
        name={(r) => r.name}
        title={(r) => `${r.classRollNo} · ${r.name}`}
        subtitle={(r) =>
          [
            sections.find((s) => s.value === r.sectionId)?.label,
            r.status !== 'active' ? tEnum(`studentStatus.${r.status}`) : null,
          ]
            .filter(Boolean)
            .join(' · ')
        }
        searchText={(r) => `${r.classRollNo} ${r.universityRollNo ?? ''} ${r.name}`}
        canEdit={(r) => editable.includes(r.id)}
        empty={t('empty')}
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
