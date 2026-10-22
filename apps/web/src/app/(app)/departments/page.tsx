import type { DepartmentRow } from '@slotwise/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/app-shell';
import { ArchivedToggle } from '@/components/entity/archived-toggle';
import { getMe, list } from '@/lib/me';
import { DepartmentsManager } from './departments-manager';

export const metadata: Metadata = { title: 'Departments' };

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const me = await getMe('/departments');
  const t = await getTranslations('departments');
  const { archived } = await searchParams;
  const rows = await list<DepartmentRow>(`/departments${archived ? '?includeArchived=1' : ''}`);
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')}>
        <ArchivedToggle showing={Boolean(archived)} />
      </PageHeader>
      <DepartmentsManager
        rows={rows}
        canCreate={me.mayOn('department.manage', { type: 'department', departmentId: null })}
        editable={rows
          .filter((r) => me.mayOn('department.manage', { type: 'department', departmentId: r.id }))
          .map((r) => r.id)}
      />
    </>
  );
}
