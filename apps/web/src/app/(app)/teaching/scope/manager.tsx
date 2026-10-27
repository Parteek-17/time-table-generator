'use client';

import type { TimetableScopeRow } from '@slotwise/shared';
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

const PATH = '/timetable-scopes';
const REVALIDATE = '/teaching/scope';

export function ScopeManager({
  termId,
  scopes,
  cohorts,
  canManage,
}: {
  termId: string;
  scopes: TimetableScopeRow[];
  cohorts: Option[];
  canManage: boolean;
}) {
  const t = useTranslations('p1.scope');
  const tEntity = useTranslations('entity');
  const fields: FieldSpec[] = [
    { name: 'name', label: t('name'), type: 'text', placeholder: 'Main' },
    { name: 'cohortIds', label: t('cohorts'), type: 'multiselect', options: cohorts },
    { name: 'notes', label: t('notes'), type: 'textarea', optional: true },
  ];
  const codes = new Map(cohorts.map((c) => [c.value, c.label]));

  return (
    <div className="flex flex-col gap-3">
      {canManage ? (
        <AddPanel label={t('add')} defaultOpen={scopes.length === 0}>
          {(close) => (
            <EntityForm
              fields={fields}
              initial={{
                termId,
                name: scopes.length === 0 ? 'Main' : '',
                notes: null,
                // A new scope starts with every running cohort ticked.
                cohortIds: cohorts.map((c) => c.value),
              }}
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
        rows={scopes}
        path={PATH}
        revalidate={REVALIDATE}
        name={(r) => r.name}
        title={(r) => r.name}
        subtitle={(r) =>
          `${t('line', { count: r.cohortIds.length })}: ${r.cohortIds
            .map((id) => codes.get(id) ?? '?')
            .join(', ')}`
        }
        canEdit={() => canManage}
        empty={t('none')}
        actions={(r) => (
          <Link
            href={`/readiness?term=${termId}&scope=${r.id}`}
            aria-label={t('checkFor', { name: r.name })}
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
          >
            {t('check')}
          </Link>
        )}
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
