import type { BatchRow, ProgrammeRow, SchemeVersionRow } from '@slotwise/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/app-shell';
import { ArchivedToggle } from '@/components/entity/archived-toggle';
import { getMe, list } from '@/lib/me';
import { BatchesManager } from './batches-manager';

export const metadata: Metadata = { title: 'Batches' };

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const me = await getMe('/batches');
  const t = await getTranslations('batches');
  const { archived } = await searchParams;
  const [rows, programmes, schemes] = await Promise.all([
    list<BatchRow>(`/batches${archived ? '?includeArchived=1' : ''}`),
    list<ProgrammeRow>('/programmes'),
    list<SchemeVersionRow>('/scheme-versions'),
  ]);
  const branches = programmes.flatMap((p) =>
    p.branches.map((b) => ({ ...b, programmeCode: p.code, programmeName: p.name })),
  );
  const deptOfBranch = new Map(branches.map((b) => [b.id, b.departmentId]));
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')}>
        <ArchivedToggle showing={Boolean(archived)} />
      </PageHeader>
      <BatchesManager
        rows={rows}
        programmes={programmes.map((p) => ({ value: p.id, label: p.name }))}
        branches={branches.map((b) => ({
          value: b.id,
          label: b.isDefault ? b.programmeName : `${b.programmeCode} · ${b.code}`,
        }))}
        schemes={schemes.map((s) => ({ value: s.id, label: `${s.programmeCode} · ${s.name}` }))}
        canCreate={me.may('cohort.manage')}
        editable={rows
          .filter((r) =>
            me.mayOn('cohort.manage', {
              type: 'batch',
              departmentId: deptOfBranch.get(r.branchId) ?? null,
            }),
          )
          .map((r) => r.id)}
      />
    </>
  );
}
