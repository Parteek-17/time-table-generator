import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/app-shell';
import { TermsSection } from './section';

export const metadata: Metadata = { title: 'Sessions and terms' };

export default async function Page() {
  const t = await getTranslations('terms');
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <TermsSection />
    </>
  );
}
