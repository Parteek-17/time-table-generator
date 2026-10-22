import type { CohortRow } from '@slotwise/shared';
import { Badge, buttonVariants } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageHeader } from '@/components/app-shell';
import { Problem } from '@/components/problem';
import { TermPicker } from '@/components/term-picker';
import { getMe, list } from '@/lib/me';
import { pickTerm } from '@/lib/terms';
import { GenerateCohorts } from '../terms/[id]/term-detail';

export const metadata: Metadata = { title: 'Cohorts and sections' };

export default async function CohortsPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  const me = await getMe('/cohorts');
  const t = await getTranslations('cohorts');
  const { terms, term } = await pickTerm((await searchParams).term);
  if (!term) {
    return (
      <>
        <PageHeader title={t('title')} />
        <Problem title={t('noTermTitle')} body={t('noTermBody')}>
          <Link href="/terms" className={buttonVariants()}>
            {t('goToTerms')}
          </Link>
        </Problem>
      </>
    );
  }
  const cohorts = await list<CohortRow>(`/cohorts?termId=${term.id}`);
  const byProgramme = new Map<string, CohortRow[]>();
  for (const c of cohorts)
    byProgramme.set(c.programmeCode, [...(byProgramme.get(c.programmeCode) ?? []), c]);
  const hostCode = new Map(cohorts.map((c) => [c.id, c.displayCode]));

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle', { term: term.label })}>
        <TermPicker terms={terms} current={term.id} />
      </PageHeader>
      {cohorts.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground">{t('empty')}</p>
          {me.may('term.manage') ? <GenerateCohorts termId={term.id} /> : null}
        </div>
      ) : (
        [...byProgramme.entries()].map(([programme, rows]) => (
          <section key={programme} className="flex flex-col gap-2" aria-label={programme}>
            <h2 className="text-lg font-semibold">{programme}</h2>
            <ul className="flex flex-col divide-y rounded-xl border">
              {rows.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {c.displayCode} {!c.isRunning ? <Badge>{t('notRunning')}</Badge> : null}
                      {c.semesterOverridden ? <Badge>{t('overridden')}</Badge> : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {c.joinsCohortId
                        ? t('joinsLine', {
                            semester: c.semester,
                            host: hostCode.get(c.joinsCohortId) ?? '?',
                          })
                        : t('line', {
                            semester: c.semester,
                            year: c.admissionYear,
                            sections: c.sectionCount,
                            students: c.strength,
                          })}
                    </p>
                  </div>
                  <Link
                    href={`/cohorts/${c.id}`}
                    className={buttonVariants({
                      size: 'sm',
                      variant: c.sectionCount === 0 && !c.joinsCohortId ? 'default' : 'outline',
                    })}
                  >
                    {c.sectionCount === 0 && !c.joinsCohortId ? t('addSections') : t('open')}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
