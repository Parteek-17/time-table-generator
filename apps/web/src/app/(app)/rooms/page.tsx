import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/app-shell';
import { ArchivedToggle } from '@/components/entity/archived-toggle';
import { RoomsSection } from './section';

export const metadata: Metadata = { title: 'Rooms' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const t = await getTranslations('rooms');
  const { archived } = await searchParams;
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')}>
        <ArchivedToggle showing={Boolean(archived)} />
      </PageHeader>
      <RoomsSection archived={Boolean(archived)} />
    </>
  );
}
