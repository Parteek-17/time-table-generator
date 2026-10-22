import type { ProgrammeRow, SchemeVersionRow } from '@slotwise/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/app-shell';
import { ArchivedToggle } from '@/components/entity/archived-toggle';
import { getMe, list } from '@/lib/me';
import { SchemesManager } from './schemes-manager';

export const metadata: Metadata = { title: 'Schemes and courses' };

export default async function SchemesPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const me = await getMe('/schemes');
  const t = await getTranslations('schemes');
  const { archived } = await searchParams;
  const [rows, programmes] = await Promise.all([
    list<SchemeVersionRow>(`/scheme-versions${archived ? '?includeArchived=1' : ''}`),
    list<ProgrammeRow>('/programmes'),
  ]);
  const deptOf = new Map(programmes.map((p) => [p.id, p.departmentId]));
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')}>
        <ArchivedToggle showing={Boolean(archived)} />
      </PageHeader>
      <SchemesManager
        rows={rows}
        programmes={programmes.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
        canCreate={me.may('academics.manage')}
        editable={rows
          .filter((s) =>
            me.mayOn('academics.manage', {
              type: 'scheme',
              departmentId: deptOf.get(s.programmeId) ?? null,
            }),
          )
          .map((s) => s.id)}
      />
    </>
  );
}
