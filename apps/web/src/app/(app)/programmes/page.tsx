import type { DepartmentRow, ProgrammeRow } from '@slotwise/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/app-shell';
import { ArchivedToggle } from '@/components/entity/archived-toggle';
import { getMe, list } from '@/lib/me';
import { ProgrammesManager } from './programmes-manager';

export const metadata: Metadata = { title: 'Programmes' };

export default async function ProgrammesPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const me = await getMe('/programmes');
  const t = await getTranslations('programmes');
  const { archived } = await searchParams;
  const [rows, departments] = await Promise.all([
    list<ProgrammeRow>(`/programmes${archived ? '?includeArchived=1' : ''}`),
    list<DepartmentRow>('/departments'),
  ]);
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')}>
        <ArchivedToggle showing={Boolean(archived)} />
      </PageHeader>
      <ProgrammesManager
        rows={rows}
        departments={departments}
        canCreate={me.may('academics.manage')}
        editable={rows
          .filter((p) =>
            me.mayOn('academics.manage', { type: 'programme', departmentId: p.departmentId }),
          )
          .map((p) => p.id)}
      />
    </>
  );
}
