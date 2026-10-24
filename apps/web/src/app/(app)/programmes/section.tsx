import type { DepartmentRow, ProgrammeRow } from '@slotwise/shared';
import { getMe, list } from '@/lib/me';
import { ProgrammesManager } from './programmes-manager';

/** Programmes (with presets) and their branches; used by /programmes and the setup wizard. */
export async function ProgrammesSection({ archived = false }: { archived?: boolean }) {
  const me = await getMe('/programmes');
  const [rows, departments] = await Promise.all([
    list<ProgrammeRow>(`/programmes${archived ? '?includeArchived=1' : ''}`),
    list<DepartmentRow>('/departments'),
  ]);
  return (
    <ProgrammesManager
      rows={rows}
      departments={departments}
      canCreate={me.may('academics.manage')}
      editable={rows
        .filter((p) =>
          me.mayOn('academics.manage', { type: 'programme', departmentId: p.departmentId }),
        )
        .map((p) => p.id)}
    />
  );
}
