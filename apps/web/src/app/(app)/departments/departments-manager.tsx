'use client';

import { DEPARTMENT_KINDS, type DepartmentRow } from '@slotwise/shared';
import { useTranslations } from 'next-intl';
import { EntityForm, type FieldSpec } from '@/components/entity/entity-form';
import { AddPanel, EntityList } from '@/components/entity/entity-list';

const PATH = '/departments';

export function DepartmentsManager({
  rows,
  canCreate,
  editable,
}: {
  rows: DepartmentRow[];
  canCreate: boolean;
  editable: string[];
}) {
  const t = useTranslations('departments');
  const tEnum = useTranslations('enums');
  const tEntity = useTranslations('entity');
  const fields: FieldSpec[] = [
    { name: 'code', label: t('code'), type: 'text', half: true, placeholder: 'CSE' },
    {
      name: 'kind',
      label: t('kind'),
      type: 'select',
      half: true,
      options: DEPARTMENT_KINDS.map((k) => ({ value: k, label: tEnum(`departmentKind.${k}`) })),
    },
    { name: 'name', label: t('name'), type: 'text', placeholder: t('namePlaceholder') },
  ];
  return (
    <>
      {canCreate ? (
        <AddPanel label={t('add')}>
          {(close) => (
            <EntityForm
              fields={fields}
              initial={{ code: '', name: '', kind: 'teaching' }}
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
        name={(r) => r.code}
        title={(r) => `${r.code} · ${r.name}`}
        subtitle={(r) => tEnum(`departmentKind.${r.kind}`)}
        searchText={(r) => `${r.code} ${r.name}`}
        canEdit={(r) => editable.includes(r.id)}
        empty={t('empty')}
        edit={(r, close) => (
          <EntityForm
            fields={fields}
            initial={r as unknown as Record<string, unknown>}
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
