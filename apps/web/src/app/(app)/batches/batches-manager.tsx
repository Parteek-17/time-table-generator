'use client';

import { BATCH_STATUSES, ENTRY_TYPES, type BatchRow } from '@slotwise/shared';
import { useTranslations } from 'next-intl';
import {
  EntityForm,
  type FieldSpec,
  type Option,
  type Values,
} from '@/components/entity/entity-form';
import { AddPanel, EntityList } from '@/components/entity/entity-list';

const PATH = '/batches';

export function BatchesManager({
  rows,
  programmes,
  branches,
  schemes,
  canCreate,
  editable,
}: {
  rows: BatchRow[];
  programmes: Option[];
  branches: Option[];
  schemes: Option[];
  canCreate: boolean;
  editable: string[];
}) {
  const t = useTranslations('batches');
  const tEnum = useTranslations('enums');
  const tEntity = useTranslations('entity');
  const fields: FieldSpec[] = [
    { name: 'programmeId', label: t('programme'), type: 'select', half: true, options: programmes },
    { name: 'branchId', label: t('branch'), type: 'select', half: true, options: branches },
    {
      name: 'admissionYear',
      label: t('admissionYear'),
      hint: t('admissionYearHint'),
      type: 'number',
      half: true,
      min: 2000,
      max: 2100,
    },
    {
      name: 'entryType',
      label: t('entryType'),
      type: 'select',
      half: true,
      options: ENTRY_TYPES.map((e) => ({ value: e, label: tEnum(`entryType.${e}`) })),
    },
    {
      name: 'schemeVersionId',
      label: t('scheme'),
      hint: t('schemeHint'),
      type: 'select',
      half: true,
      options: schemes,
    },
    {
      name: 'status',
      label: t('status'),
      type: 'select',
      half: true,
      options: BATCH_STATUSES.map((s) => ({ value: s, label: tEnum(`batchStatus.${s}`) })),
    },
  ];
  const label = (r: BatchRow) =>
    `${r.programmeCode} ${r.branchCode === 'GEN' ? '' : `${r.branchCode} `}${r.admissionYear}${
      r.entryType === 'lateral' ? ' LEET' : ''
    }`;
  return (
    <>
      {canCreate ? (
        <AddPanel label={t('add')}>
          {(close) => (
            <EntityForm
              fields={fields}
              initial={{
                programmeId: '',
                branchId: '',
                admissionYear: new Date().getFullYear(),
                entryType: 'regular',
                schemeVersionId: '',
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
        name={label}
        title={label}
        subtitle={(r) => `${r.schemeVersionName} · ${tEnum(`batchStatus.${r.status}`)}`}
        searchText={label}
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
