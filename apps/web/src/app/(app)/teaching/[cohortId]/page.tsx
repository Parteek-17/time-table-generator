import type { TeachingGridDto } from '@slotwise/shared';
import { buttonVariants } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell';
import { Problem } from '@/components/problem';
import { api } from '@/lib/api';
import { getMe } from '@/lib/me';
import { TeachingGrid } from './grid';

export const metadata: Metadata = { title: 'Who teaches what' };

/** Teaching grid of one cohort (docs/phase1/plan.md screen 18). */
export default async function TeachingGridPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  const { cohortId } = await params;
  const me = await getMe(`/teaching/${cohortId}`);
  const t = await getTranslations('p1.teaching');
  const res = await api<TeachingGridDto>(`/teaching/${encodeURIComponent(cohortId)}`);
  if (!res.ok) notFound();
  const grid = res.data;
  const back = (
    <Link
      href={`/teaching?term=${grid.termId}`}
      className={buttonVariants({ size: 'sm', variant: 'outline' })}
    >
      {t('back')}
    </Link>
  );

  if (grid.cohort.joinsCohortId) {
    return (
      <>
        <PageHeader title={grid.cohort.displayCode}>{back}</PageHeader>
        <Problem
          title={t('title')}
          body={t('joinsBody', {
            code: grid.cohort.displayCode,
            host: grid.cohort.joinsDisplayCode ?? '',
          })}
        >
          <Link href={`/teaching/${grid.cohort.joinsCohortId}`} className={buttonVariants()}>
            {t('openHost', { host: grid.cohort.joinsDisplayCode ?? '' })}
          </Link>
        </Problem>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`${t('title')}: ${grid.cohort.displayCode}`}
        description={t('gridSubtitle', { semester: grid.cohort.semester })}
      >
        {back}
      </PageHeader>
      {grid.rows.length === 0 ? (
        grid.mentors.length > 0 ? (
          <Problem title={grid.cohort.displayCode} body={t('noSections')}>
            <Link href={`/cohorts/${grid.cohort.id}`} className={buttonVariants()}>
              {t('addSections')}
            </Link>
          </Problem>
        ) : (
          <Problem title={grid.cohort.displayCode} body={t('noCourses')} />
        )
      ) : (
        <TeachingGrid initial={grid} canEdit={me.may('teaching.manage')} />
      )}
    </>
  );
}
