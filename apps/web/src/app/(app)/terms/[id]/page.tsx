import { nextTerm, type CohortRow, type TermRow } from '@slotwise/shared';
import { Badge, buttonVariants } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell';
import { api } from '@/lib/api';
import { getMe, list } from '@/lib/me';
import { TermStartsSection } from './section';
import { GenerateCohorts, PromotePanel } from './term-detail';

export const metadata: Metadata = { title: 'Term' };

export default async function TermPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe(`/terms/${id}`);
  const [t, tEnum] = await Promise.all([getTranslations('terms'), getTranslations('enums')]);
  const termRes = await api<TermRow>(`/terms/${encodeURIComponent(id)}`);
  if (!termRes.ok) notFound();
  const term = termRes.data;
  const [cohorts, terms] = await Promise.all([
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

      <TermStartsSection term={term} />

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
