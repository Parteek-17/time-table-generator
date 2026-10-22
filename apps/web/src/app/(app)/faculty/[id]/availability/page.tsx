import type { AvailabilityDto, FacultyRow } from '@slotwise/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell';
import { AvailabilityGrid } from '@/components/availability-grid';
import { api } from '@/lib/api';
import { getMe } from '@/lib/me';

export const metadata: Metadata = { title: 'Availability' };

export default async function FacultyAvailabilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getMe(`/faculty/${id}/availability`);
  const t = await getTranslations('availability');
  const [availability, faculty] = await Promise.all([
    api<AvailabilityDto>(`/faculty/${encodeURIComponent(id)}/availability`),
    api<FacultyRow>(`/faculty/${encodeURIComponent(id)}`),
  ]);
  if (!availability.ok || !faculty.ok) notFound();
  const canEdit = me.mayOn('faculty.availability.edit', {
    type: 'faculty',
    departmentId: faculty.data.homeDepartmentId,
    ownerUserId: faculty.data.userId,
  });
  return (
    <>
      <PageHeader
        title={t('titleFor', { name: availability.data.name })}
        description={t('subtitle')}
      />
      <AvailabilityGrid
        availability={availability.data}
        canEdit={canEdit}
        revalidate={`/faculty/${id}/availability`}
      />
    </>
  );
}
