'use client';

import { SCHEME_STATUSES, type SchemeVersionRow } from '@slotwise/shared';
import { buttonVariants } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  EntityForm,
  type FieldSpec,
  type Option,
  type Values,
} from '@/components/entity/entity-form';
import { AddPanel, EntityList } from '@/components/entity/entity-list';

const PATH = '/scheme-versions';

export function SchemesManager({
  rows,
  programmes,
  canCreate,
  editable,
}: {
  rows: SchemeVersionRow[];
  programmes: Option[];
  canCreate: boolean;
  editable: string[];
}) {
  const t = useTranslations('schemes');
  const tEnum = useTranslations('enums');
  const tEntity = useTranslations('entity');
  const fields = (creating: boolean): FieldSpec[] => [
    ...(creating
      ? [
          {
            name: 'programmeId',
            label: t('programme'),
            type: 'select',
            options: programmes,
          } as FieldSpec,
        ]
      : []),
    { name: 'name', label: t('name'), type: 'text', half: true, placeholder: 'Scheme 2024' },
    {
      name: 'status',
      label: t('status'),
      type: 'select',
      half: true,
      options: SCHEME_STATUSES.map((s) => ({ value: s, label: tEnum(`schemeStatus.${s}`) })),
    },
  ];
  return (
    <>
      {canCreate ? (
        <AddPanel label={t('add')}>
          {(close) => (
            <EntityForm
              fields={fields(true)}
              initial={{ programmeId: '', name: '', status: 'active' }}
              path={PATH}
              id={null}
              revalidate="/schemes"
              submitLabel={tEntity('add')}
              onCancel={close}
            />
          )}
        </AddPanel>
      ) : null}
      <EntityList
        rows={rows}
        path={PATH}
        revalidate="/schemes"
        name={(r) => `${r.programmeCode} ${r.name}`}
        title={(r) => `${r.programmeCode} · ${r.name}`}
        subtitle={(r) =>
          `${tEnum(`schemeStatus.${r.status}`)} · ${t('courseCount', { count: r.courseCount })}`
        }
        searchText={(r) => `${r.programmeCode} ${r.name}`}
        canEdit={(r) => editable.includes(r.id)}
        empty={t('empty')}
        actions={(r) =>
          r.archivedAt ? null : (
            <Link href={`/schemes/${r.id}`} className={buttonVariants({ size: 'sm' })}>
              {t('courses')}
            </Link>
          )
        }
        edit={(r, close) => (
          <EntityForm
            fields={fields(false)}
            initial={r as unknown as Values}
            path={PATH}
            id={r.id}
            revalidate="/schemes"
            submitLabel={tEntity('save')}
            onSaved={close}
            onCancel={close}
          />
        )}
      />
    </>
  );
}
