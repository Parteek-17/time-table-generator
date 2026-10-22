import type { BuildingRow, DepartmentRow, RoomRow } from '@slotwise/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/app-shell';
import { ArchivedToggle } from '@/components/entity/archived-toggle';
import { getMe, list } from '@/lib/me';
import { RoomsManager } from './rooms-manager';

export const metadata: Metadata = { title: 'Rooms' };

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const me = await getMe('/rooms');
  const t = await getTranslations('rooms');
  const { archived } = await searchParams;
  const suffix = archived ? '?includeArchived=1' : '';
  const [rooms, buildings, departments] = await Promise.all([
    list<RoomRow>(`/rooms${suffix}`),
    list<BuildingRow>(`/buildings${suffix}`),
    list<DepartmentRow>('/departments'),
  ]);
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')}>
        <ArchivedToggle showing={Boolean(archived)} />
      </PageHeader>
      <RoomsManager
        rooms={rooms}
        buildings={buildings}
        departments={departments.map((d) => ({ value: d.id, label: d.code }))}
        canManage={me.may('infrastructure.manage')}
      />
    </>
  );
}
