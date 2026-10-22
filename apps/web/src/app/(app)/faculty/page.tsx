import type { DepartmentRow, FacultyRow } from '@slotwise/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/app-shell';
import { ArchivedToggle } from '@/components/entity/archived-toggle';
import { getMe, list } from '@/lib/me';
import { FacultyManager } from './faculty-manager';

export const metadata: Metadata = { title: 'Faculty' };

export default async function FacultyPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; dept?: string }>;
}) {
  const me = await getMe('/faculty');
  const t = await getTranslations('faculty');
  const { archived, dept } = await searchParams;
  const query = new URLSearchParams();
  if (archived) query.set('includeArchived', '1');
  if (dept) query.set('departmentId', dept);
  const [rows, departments] = await Promise.all([
    list<FacultyRow>(`/faculty?${query.toString()}`),
    list<DepartmentRow>('/departments'),
  ]);
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')}>
        <ArchivedToggle showing={Boolean(archived)} base={dept ? `?dept=${dept}` : ''} />
      </PageHeader>
      <FacultyManager
        rows={rows}
        dept={dept ?? ''}
        departments={departments.map((d) => ({ value: d.id, label: d.code }))}
        canCreate={me.may('faculty.manage')}
        editable={rows
          .filter((r) =>
            me.mayOn('faculty.manage', { type: 'faculty', departmentId: r.homeDepartmentId }),
          )
          .map((r) => r.id)}
        availabilityEditable={rows
          .filter((r) =>
            me.mayOn('faculty.availability.edit', {
              type: 'faculty',
              departmentId: r.homeDepartmentId,
              ownerUserId: r.userId,
            }),
          )
          .map((r) => r.id)}
      />
    </>
  );
}
