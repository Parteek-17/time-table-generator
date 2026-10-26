import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/app-shell';
import { InstituteSection } from './section';

export const metadata: Metadata = { title: 'Institute' };

export default async function InstitutePage() {
  const t = await getTranslations('institute');
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <InstituteSection />
    </>
  );
}
