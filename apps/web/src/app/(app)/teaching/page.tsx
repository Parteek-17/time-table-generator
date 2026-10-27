import { buttonVariants } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageHeader } from '@/components/app-shell';
import { Problem } from '@/components/problem';
import { TermPicker } from '@/components/term-picker';
import { getMe } from '@/lib/me';
import { pickTerm } from '@/lib/terms';
import { BeforeGenerating, TeachingSection } from './section';

export const metadata: Metadata = { title: 'Who teaches what' };

export default async function TeachingPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  await getMe('/teaching');
  const t = await getTranslations('p1.teaching');
  const { terms, term } = await pickTerm((await searchParams).term);
  if (!term) {
    return (
      <>
        <PageHeader title={t('title')} />
        <Problem title={t('noTermTitle')} body={t('noTermBody')}>
          <Link href="/terms" className={buttonVariants()}>
            {t('open')}
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
      <TeachingSection term={term} />
      <BeforeGenerating termId={term.id} />
    </>
  );
}
