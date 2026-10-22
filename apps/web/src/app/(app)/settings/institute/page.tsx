import type { InstituteProfileDto } from '@slotwise/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/app-shell';
import { Problem } from '@/components/problem';
import { api } from '@/lib/api';
import { getMe } from '@/lib/me';
import { InstituteForm } from './institute-form';

export const metadata: Metadata = { title: 'Institute' };

export default async function InstitutePage() {
  const me = await getMe('/settings/institute');
  const t = await getTranslations('institute');
  const profile = await api<InstituteProfileDto>('/institute/profile');
  if (!profile.ok) return <Problem title={profile.message} />;
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <InstituteForm profile={profile.data} canEdit={me.may('institute.manage')} />
    </>
  );
}
