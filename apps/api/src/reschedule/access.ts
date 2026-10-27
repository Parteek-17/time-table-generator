import { ForbiddenException } from '@nestjs/common';
import { can } from '@slotwise/shared';
import type { TimetableSlotV1 } from '@slotwise/shared/contracts';
import type { RescheduleCalendar } from '@slotwise/shared/reschedule';
import type { Tenant } from '../common/request-context';

/**
 * Changing one class (cancel it, book or undo its make-up) needs timetable.edit for the
 * department of every section in it, as editing it in the timetable would.
 */
export function assertMayChangeClass(
  tenant: Tenant,
  slot: Pick<TimetableSlotV1, 'sectionIds'>,
  cal: RescheduleCalendar,
): void {
  const allowed = slot.sectionIds.every((sectionId) =>
    can(tenant.authUser, 'timetable.edit', {
      type: 'timetable',
      instituteId: tenant.institute.id,
      departmentId: cal.sections.get(sectionId)?.departmentId ?? null,
      sectionId,
    }),
  );
  if (!allowed) {
    throw new ForbiddenException(
      'You don’t have permission to change this class. Ask your HOD or the timetable in-charge.',
    );
  }
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const asDate = (date: string) => new Date(`${date}T00:00:00Z`);
