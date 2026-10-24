import {
  runningSemesters,
  type ProgrammeRow,
  type TermCohortWindowRow,
  type TermRow,
} from '@slotwise/shared';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@slotwise/ui';
import { getTranslations } from 'next-intl/server';
import { getMe, list } from '@/lib/me';
import { WindowsManager } from './term-detail';

/**
 * Which semesters run in a term, and when each group starts (first year and lateral entry
 * often later). Used by the term page and the setup wizard's term step.
 */
export async function TermStartsSection({ term }: { term: TermRow }) {
  const me = await getMe(`/terms/${term.id}`);
  const t = await getTranslations('terms');
  const [programmes, windows] = await Promise.all([
    list<ProgrammeRow>('/programmes'),
    list<TermCohortWindowRow>(`/term-cohort-windows?termId=${term.id}`),
  ]);
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('runningTitle')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('runningHint')}</p>
        </CardHeader>
        <CardContent>
          {programmes.length === 0 ? (
            <p className="text-muted-foreground">{t('noProgrammes')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {programmes.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-24 font-medium">{p.name}</span>
                  {runningSemesters(p, term.kind).map((s) => (
                    <Badge key={s}>{t('semesterShort', { semester: s })}</Badge>
                  ))}
                  {p.lateralEntrySemester ? (
                    <span className="text-sm text-muted-foreground">
                      {t('leetJoins', { semester: p.lateralEntrySemester })}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="windows-heading">
        <h2 id="windows-heading" className="text-lg font-semibold">
          {t('windowsTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('windowsHint')}</p>
        <WindowsManager
          termId={term.id}
          rows={windows}
          programmes={programmes.map((p) => ({ value: p.id, label: p.name }))}
          canManage={me.may('term.manage')}
        />
      </section>
    </>
  );
}
