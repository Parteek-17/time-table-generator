import { isFlagOn } from '@slotwise/shared';
import type { SolveJobDto } from '@slotwise/shared/timetable';
import { buttonVariants } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell';
import { Problem } from '@/components/problem';
import { api } from '@/lib/api';
import { getMe, list } from '@/lib/me';
import { termsAndCurrent } from '../data';
import { UrlSelect } from '../url-select';
import { GenerateForm } from './generate-form';

export const metadata: Metadata = { title: 'Generate a timetable' };

/** One screen, one task: generate a draft timetable for a term. */
export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  if (!isFlagOn('P2T')) notFound();
  const me = await getMe('/timetable/generate');
  const [t, { term: termParam }] = await Promise.all([getTranslations('p2t'), searchParams]);
  const back = (
    <Link href="/timetable" className={buttonVariants({ variant: 'outline' })}>
      {t('generate.back')}
    </Link>
  );
  const header = (
    <PageHeader title={t('generate.title')} description={t('generate.description')}>
      {back}
    </PageHeader>
  );

  if (!me.may('timetable.edit')) {
    return (
      <>
        {header}
        <Problem title={t('generate.notAllowedTitle')} body={t('generate.notAllowedBody')} />
      </>
    );
  }
  const { terms, term } = await termsAndCurrent(termParam);
  if (!term) {
    return (
      <>
        {header}
        <Problem title={t('empty.noTermTitle')} body={t('empty.noTermBody')}>
          <Link href="/terms" className={buttonVariants({ variant: 'outline' })}>
            {t('empty.noTermAction')}
          </Link>
        </Problem>
      </>
    );
  }

  const [scopes, jobs] = await Promise.all([
    list<{ id: string; name: string; cohortCount: number }>(`/terms/${term.id}/timetable/scopes`),
    api<SolveJobDto[]>(`/terms/${term.id}/timetable/jobs`),
  ]);
  const running =
    (jobs.ok ? jobs.data : []).find((j) => j.status === 'queued' || j.status === 'running') ?? null;

  return (
    <>
      {header}
      <UrlSelect
        param="term"
        label={t('term')}
        value={term.id}
        options={terms.map((x) => ({ value: x.id, label: x.label }))}
      />
      {/* key: a new term starts a fresh form. */}
      <GenerateForm key={term.id} termId={term.id} scopes={scopes} running={running} />
    </>
  );
}
