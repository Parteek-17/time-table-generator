import type { Institute, TxClient } from '@slotwise/db';
import type { Resource, ResourceType, ScopeDto, ScopeType } from '@slotwise/shared';

/** Looks up human names for membership/invite scopes in one query. */
export async function scopeNamer(
  tx: TxClient,
  institute: Institute,
): Promise<(scopeType: ScopeType, scopeId: string | null) => ScopeDto> {
  const departments = await tx.department.findMany({
    where: { instituteId: institute.id },
    select: { id: true, name: true },
  });
  const deptNames = new Map(departments.map((d) => [d.id, d.name]));
  return (type, id) => {
    if (type === 'platform') return { type, id, name: 'Slotwise' };
    if (type === 'department')
      return { type, id, name: deptNames.get(id ?? '') ?? 'Unknown department' };
    if (type === 'institute' && id === institute.id) return { type, id, name: institute.name };
    return { type, id, name: type === 'university' ? 'University' : 'Section' };
  };
}

/** The can() resource for a membership or invite row. */
export function scopedResource(
  type: ResourceType,
  institute: Institute,
  row: { scopeType: ScopeType; scopeId: string | null; role?: Resource['role'] },
): Resource {
  return {
    type,
    instituteId: institute.id,
    universityId: institute.parentUniversityId,
    departmentId: row.scopeType === 'department' ? row.scopeId : null,
    sectionId: row.scopeType === 'section' ? row.scopeId : null,
    role: row.role,
  };
}
