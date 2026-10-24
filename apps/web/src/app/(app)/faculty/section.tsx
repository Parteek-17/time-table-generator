import type { DepartmentRow, FacultyRow } from '@slotwise/shared';
import { getMe, list } from '@/lib/me';
import { FacultyManager } from './faculty-manager';

/** Faculty with bulk limits and availability links; used by /faculty and the setup wizard. */
export async function FacultySection({
  archived = false,
  dept = '',
}: {
  archived?: boolean;
  dept?: string;
}) {
  const me = await getMe('/faculty');
  const query = new URLSearchParams();
  if (archived) query.set('includeArchived', '1');
  if (dept) query.set('departmentId', dept);
  const [rows, departments] = await Promise.all([
    list<FacultyRow>(`/faculty?${query.toString()}`),
    list<DepartmentRow>('/departments'),
  ]);
  return (
    <FacultyManager
      rows={rows}
      dept={dept}
      departments={departments.map((d) => ({ value: d.id, label: d.code }))}
      canCreate={me.may('faculty.manage')}
      editable={rows
        .filter((r) =>
          me.mayOn('faculty.manage', { type: 'faculty', departmentId: r.homeDepartmentId }),
        )
        .map((r) => r.id)}
      availabilityEditable={rows
        .filter((r) =>
          me.mayOn('faculty.availability.edit', {
            type: 'faculty',
            departmentId: r.homeDepartmentId,
            ownerUserId: r.userId,
          }),
        )
        .map((r) => r.id)}
    />
  );
}
