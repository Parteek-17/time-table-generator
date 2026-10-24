import type { CohortRow, TermRow } from '@slotwise/shared';
import { Badge, buttonVariants } from '@slotwise/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { getMe, list } from '@/lib/me';
import { GenerateCohorts } from '../terms/[id]/term-detail';

/**
 * A term's cohorts grouped by programme, each with its sections or an "Add sections" button.
 * With no cohorts yet, offers to create them from batches. Used by /cohorts and the wizard.
 */
export async function CohortsSection({ term }: { term: TermRow }) {
  const me = await getMe('/cohorts');
  const t = await getTranslations('cohorts');
  const cohorts = await list<CohortRow>(`/cohorts?termId=${term.id}`);
  if (cohorts.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground">{t('empty')}</p>
        {me.may('term.manage') ? <GenerateCohorts termId={term.id} /> : null}
      </div>
    );
  }
  const byProgramme = new Map<string, CohortRow[]>();
  for (const c of cohorts) {
    byProgramme.set(c.programmeCode, [...(byProgramme.get(c.programmeCode) ?? []), c]);
  }
  const hostCode = new Map(cohorts.map((c) => [c.id, c.displayCode]));
  return (
    <>
      {[...byProgramme.entries()].map(([programme, rows]) => (
        <section key={programme} className="flex flex-col gap-2" aria-label={programme}>
          <h2 className="text-lg font-semibold">{programme}</h2>
          <ul className="flex flex-col divide-y rounded-xl border">
            {rows.map((c) => {
              const needsSections = c.sectionCount === 0 && !c.joinsCohortId && c.isRunning;
              return (
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
                      variant: needsSections ? 'default' : 'outline',
                    })}
                  >
                    {needsSections ? t('addSections') : t('open')}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
