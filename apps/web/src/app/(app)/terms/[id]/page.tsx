import {
  nextTerm,
  runningSemesters,
  type CohortRow,
  type ProgrammeRow,
  type TermCohortWindowRow,
  type TermRow,
} from '@slotwise/shared';
import { Badge, buttonVariants, Card, CardContent, CardHeader, CardTitle } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell';
import { api } from '@/lib/api';
import { getMe, list } from '@/lib/me';
import { GenerateCohorts, PromotePanel, WindowsManager } from './term-detail';

export const metadata: Metadata = { title: 'Term' };

export default async function TermPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe(`/terms/${id}`);
  const [t, tEnum] = await Promise.all([getTranslations('terms'), getTranslations('enums')]);
  const termRes = await api<TermRow>(`/terms/${encodeURIComponent(id)}`);
  if (!termRes.ok) notFound();
  const term = termRes.data;
  const [programmes, windows, cohorts, terms] = await Promise.all([
    list<ProgrammeRow>('/programmes'),
    list<TermCohortWindowRow>(`/term-cohort-windows?termId=${id}`),
    list<CohortRow>(`/cohorts?termId=${id}`),
    list<TermRow>('/terms'),
  ]);
  const canManage = me.may('term.manage');
  const following = nextTerm({ sessionStartYear: term.sessionStartYear, kind: term.kind });
  const nextTerms = terms.filter(
    (x) => x.sessionStartYear === following.sessionStartYear && x.kind === following.kind,
  );

  return (
    <>
      <PageHeader title={term.label} description={`${term.startDate} – ${term.endDate}`}>
        <Badge>{tEnum(`termStatus.${term.status}`)}</Badge>
      </PageHeader>

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
          termId={id}
          rows={windows}
          programmes={programmes.map((p) => ({ value: p.id, label: p.name }))}
          canManage={canManage}
        />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="cohorts-heading">
        <h2 id="cohorts-heading" className="text-lg font-semibold">
          {t('cohortsTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('cohortsCount', { count: cohorts.length })}{' '}
          <Link className="text-primary underline" href={`/cohorts?term=${id}`}>
            {t('seeCohorts')}
          </Link>
        </p>
        {canManage ? <GenerateCohorts termId={id} /> : null}
      </section>

      {canManage ? (
        <section className="flex flex-col gap-3" aria-labelledby="promote-heading">
          <h2 id="promote-heading" className="text-lg font-semibold">
            {t('promoteTitle')}
          </h2>
          {term.status !== 'closed' ? (
            <p className="text-sm text-muted-foreground">{t('promoteNeedsClosed')}</p>
          ) : nextTerms.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('promoteNeedsNext')}{' '}
              <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href="/terms">
                {t('addTerm')}
              </Link>
            </p>
          ) : (
            <PromotePanel
              fromTermId={id}
              toTerms={nextTerms.map((x) => ({ value: x.id, label: x.label }))}
            />
          )}
        </section>
      ) : null}
    </>
  );
}
