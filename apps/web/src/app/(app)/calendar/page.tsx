import { buttonVariants } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageHeader } from '@/components/app-shell';
import { Problem } from '@/components/problem';
import { TermPicker } from '@/components/term-picker';
import { pickTerm } from '@/lib/terms';
import { CalendarSection } from './section';

export const metadata: Metadata = { title: 'Calendar' };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  const t = await getTranslations('calendar');
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
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle', { term: term.label })}>
        <TermPicker terms={terms} current={term.id} />
      </PageHeader>
      <CalendarSection term={term} />
    </>
  );
}
