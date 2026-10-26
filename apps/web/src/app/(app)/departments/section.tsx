import type { DepartmentRow } from '@slotwise/shared';
import { getMe, list } from '@/lib/me';
import { DepartmentsManager } from './departments-manager';

/** Departments list and form; used by /departments and the setup wizard. */
export async function DepartmentsSection({ archived = false }: { archived?: boolean }) {
  const me = await getMe('/departments');
  const rows = await list<DepartmentRow>(`/departments${archived ? '?includeArchived=1' : ''}`);
  return (
    <DepartmentsManager
      rows={rows}
      canCreate={me.mayOn('department.manage', { type: 'department', departmentId: null })}
      editable={rows
        .filter((r) => me.mayOn('department.manage', { type: 'department', departmentId: r.id }))
        .map((r) => r.id)}
    />
  );
}
