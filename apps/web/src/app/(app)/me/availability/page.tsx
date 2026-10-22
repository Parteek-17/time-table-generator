import type { AvailabilityDto } from '@slotwise/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/app-shell';
import { AvailabilityGrid } from '@/components/availability-grid';
import { Problem } from '@/components/problem';
import { api } from '@/lib/api';
import { getMe } from '@/lib/me';

export const metadata: Metadata = { title: 'My availability' };

/** A faculty member marks the periods they cannot teach. Phone first: one grid, one button. */
export default async function MyAvailabilityPage() {
  await getMe('/me/availability');
  const t = await getTranslations('availability');
  const mine = await api<{ facultyId: string | null }>('/me/faculty');
  if (!mine.ok || !mine.data.facultyId) {
    return (
      <>
        <PageHeader title={t('myTitle')} />
        <Problem title={t('notLinkedTitle')} body={t('notLinkedBody')} />
      </>
    );
  }
  const availability = await api<AvailabilityDto>(`/faculty/${mine.data.facultyId}/availability`);
  if (!availability.ok) return <Problem title={availability.message} />;
  return (
    <>
      <PageHeader title={t('myTitle')} description={t('mySubtitle')} />
      <AvailabilityGrid availability={availability.data} canEdit revalidate="/me/availability" />
    </>
  );
}
