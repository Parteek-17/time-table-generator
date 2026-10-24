import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/app-shell';
import { ArchivedToggle } from '@/components/entity/archived-toggle';
import { FacultySection } from './section';

export const metadata: Metadata = { title: 'Faculty' };

export default async function FacultyPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; dept?: string }>;
}) {
  const t = await getTranslations('faculty');
  const { archived, dept } = await searchParams;
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')}>
        <ArchivedToggle showing={Boolean(archived)} base={dept ? `?dept=${dept}` : ''} />
      </PageHeader>
      <FacultySection archived={Boolean(archived)} dept={dept ?? ''} />
    </>
  );
}
