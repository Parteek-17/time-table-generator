import type { ProgrammeRow, SchemeVersionRow } from '@slotwise/shared';
import { getMe, list } from '@/lib/me';
import { SchemesManager } from './schemes-manager';

/** Scheme versions (each links to its courses); used by /schemes and the setup wizard. */
export async function SchemesSection({ archived = false }: { archived?: boolean }) {
  const me = await getMe('/schemes');
  const [rows, programmes] = await Promise.all([
    list<SchemeVersionRow>(`/scheme-versions${archived ? '?includeArchived=1' : ''}`),
    list<ProgrammeRow>('/programmes'),
  ]);
  const deptOf = new Map(programmes.map((p) => [p.id, p.departmentId]));
  return (
    <SchemesManager
      rows={rows}
      programmes={programmes.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
      canCreate={me.may('academics.manage')}
      editable={rows
        .filter((s) =>
          me.mayOn('academics.manage', {
            type: 'scheme',
            departmentId: deptOf.get(s.programmeId) ?? null,
          }),
        )
        .map((s) => s.id)}
    />
  );
}
