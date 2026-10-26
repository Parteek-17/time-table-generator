import type { BuildingRow, DepartmentRow, RoomRow } from '@slotwise/shared';
import { getMe, list } from '@/lib/me';
import { RoomsManager } from './rooms-manager';

/** Buildings and rooms; used by /rooms and the setup wizard. */
export async function RoomsSection({ archived = false }: { archived?: boolean }) {
  const me = await getMe('/rooms');
  const suffix = archived ? '?includeArchived=1' : '';
  const [rooms, buildings, departments] = await Promise.all([
    list<RoomRow>(`/rooms${suffix}`),
    list<BuildingRow>(`/buildings${suffix}`),
    list<DepartmentRow>('/departments'),
  ]);
  return (
    <RoomsManager
      rooms={rooms}
      buildings={buildings}
      departments={departments.map((d) => ({ value: d.id, label: d.code }))}
      canManage={me.may('infrastructure.manage')}
    />
  );
}
