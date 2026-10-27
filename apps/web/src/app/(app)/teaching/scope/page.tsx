import type { CohortRow, TimetableScopeRow } from '@slotwise/shared';
import { buttonVariants } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageHeader } from '@/components/app-shell';
import { Problem } from '@/components/problem';
import { TermPicker } from '@/components/term-picker';
import { getMe, list } from '@/lib/me';
import { pickTerm } from '@/lib/terms';
import { ScopeManager } from './manager';

export const metadata: Metadata = { title: 'Timetable scope' };

/** Which running cohorts one timetable covers (plan screen 20). */
export default async function TimetableScopePage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  const me = await getMe('/teaching/scope');
  const [t, tTeaching] = await Promise.all([
    getTranslations('p1.scope'),
    getTranslations('p1.teaching'),
  ]);
  const { terms, term } = await pickTerm((await searchParams).term);
  if (!term) {
    return (
      <>
        <PageHeader title={t('title')} />
        <Problem title={tTeaching('noTermTitle')} body={tTeaching('noTermBody')}>
          <Link href="/terms" className={buttonVariants()}>
            {tTeaching('open')}
          </Link>
        </Problem>
      </>
    );
  }
  const [scopes, cohorts] = await Promise.all([
    list<TimetableScopeRow>(`/timetable-scopes?termId=${term.id}`),
    list<CohortRow>(`/cohorts?termId=${term.id}`),
  ]);
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle', { term: term.label })}>
        <TermPicker terms={terms} current={term.id} />
      </PageHeader>
      <ScopeManager
        termId={term.id}
        scopes={scopes}
        cohorts={cohorts
          .filter((c) => c.isRunning)
          .map((c) => ({ value: c.id, label: c.displayCode }))}
        canManage={me.may('timetable_scope.manage')}
      />
    </>
  );
}
