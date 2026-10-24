import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/app-shell';
import { ArchivedToggle } from '@/components/entity/archived-toggle';
import { SchemesSection } from './section';

export const metadata: Metadata = { title: 'Schemes and courses' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const t = await getTranslations('schemes');
  const { archived } = await searchParams;
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')}>
        <ArchivedToggle showing={Boolean(archived)} />
      </PageHeader>
      <SchemesSection archived={Boolean(archived)} />
    </>
  );
}
