import type { AcademicSessionRow, TermRow } from '@slotwise/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/app-shell';
import { getMe, list } from '@/lib/me';
import { TermsManager } from './terms-manager';

export const metadata: Metadata = { title: 'Sessions and terms' };

export default async function TermsPage() {
  const me = await getMe('/terms');
  const t = await getTranslations('terms');
  const [sessions, terms] = await Promise.all([
    list<AcademicSessionRow>('/sessions'),
    list<TermRow>('/terms'),
  ]);
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <TermsManager sessions={sessions} terms={terms} canManage={me.may('term.manage')} />
    </>
  );
}
