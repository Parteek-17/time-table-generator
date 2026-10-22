import type { BatchRow, CohortRow, SectionRow, StudentRow } from '@slotwise/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/app-shell';
import { ArchivedToggle } from '@/components/entity/archived-toggle';
import { getMe, list } from '@/lib/me';
import { pickTerm } from '@/lib/terms';
import { StudentsManager } from './students-manager';

export const metadata: Metadata = { title: 'Students' };

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; batch?: string }>;
}) {
  const me = await getMe('/students');
  const t = await getTranslations('students');
  const { archived, batch } = await searchParams;
  const { term } = await pickTerm(undefined);
  const query = new URLSearchParams();
  if (archived) query.set('includeArchived', '1');
  if (batch) query.set('batchId', batch);
  const [rows, batches, sections, cohorts] = await Promise.all([
    list<StudentRow>(`/students?${query.toString()}`),
    list<BatchRow>('/batches'),
    term ? list<SectionRow>(`/sections?termId=${term.id}`) : Promise.resolve([]),
    term ? list<CohortRow>(`/cohorts?termId=${term.id}`) : Promise.resolve([]),
  ]);
  const cohortOf = new Map(cohorts.map((c) => [c.id, c]));
  const branchDept = new Map(cohorts.map((c) => [c.batchId, c.departmentId]));
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')}>
        <ArchivedToggle showing={Boolean(archived)} base={batch ? `?batch=${batch}` : ''} />
      </PageHeader>
      <StudentsManager
        rows={rows}
        batch={batch ?? ''}
        batches={batches.map((b) => ({
          value: b.id,
          label: `${b.programmeCode} ${b.branchCode === 'GEN' ? '' : `${b.branchCode} `}${b.admissionYear}${b.entryType === 'lateral' ? ' LEET' : ''}`,
        }))}
        sections={sections.map((s) => ({
          value: s.id,
          label: `${s.displayName} (${cohortOf.get(s.cohortId)?.displayCode ?? ''})`,
        }))}
        subGroups={sections.flatMap((s) =>
          s.subGroups.map((g) => ({ value: g.id, label: `${g.name} (${s.displayName})` })),
        )}
        canCreate={me.may('cohort.manage')}
        editable={rows
          .filter((r) =>
            me.mayOn('cohort.manage', {
              type: 'student',
              departmentId: branchDept.get(r.batchId) ?? null,
            }),
          )
          .map((r) => r.id)}
      />
    </>
  );
}
