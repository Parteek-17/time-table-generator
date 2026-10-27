import type { TxClient } from '@slotwise/db';
import type { BusySlotV1 } from '@slotwise/shared/contracts';
import { busySlotsFrom } from '@slotwise/shared/timetable';

/**
 * Cells other published timetables of the term use (other timetable scopes), so a new or
 * edited timetable does not double-book their teachers, rooms or sections. The published
 * version of the same scope is left out: the draft replaces it.
 */
export async function publishedBusySlots(
  tx: TxClient,
  termId: string,
  scopeId: string | null,
  ownSectionIds: ReadonlySet<string>,
): Promise<BusySlotV1[]> {
  const others = await tx.timetableVersion.findMany({
    // `NOT: { scopeId }` would also drop versions without a scope.
    where: {
      termId,
      status: 'published',
      ...(scopeId
        ? { OR: [{ scopeId: null }, { scopeId: { not: scopeId } }] }
        : { scopeId: { not: null } }),
    },
    include: {
      scope: { select: { name: true } },
      slots: {
        select: {
          sectionIds: true,
          facultyIds: true,
          roomId: true,
          weekday: true,
          startPeriod: true,
          length: true,
        },
      },
    },
  });
  return others.flatMap((v) =>
    busySlotsFrom(v.slots, ownSectionIds, `${v.scope?.name ?? 'Whole-term'} timetable (published)`),
  );
}
