/**
 * Test double for TermSource: the demo fixtures (setup snapshot and CS B's published week),
 * with the term stretched to mid-2027 and no cohort teaching windows, holidays, exam windows or
 * extra working days, so tests that book make-ups "next week" keep working as the real calendar
 * moves on. Those calendar rules are unit-tested in @slotwise/shared/reschedule.
 */
import type { INestApplication } from '@nestjs/common';
import type { TimetableSlotV1 } from '@slotwise/shared/contracts';
import { demoPublishedTimetable, demoTermSnapshot } from '@slotwise/shared/fixtures';
import { TermSource, type SlotQuery } from './term-source';

export const TEST_TERM_END = '2027-06-30';

export const fixtureSnapshot = demoTermSnapshot();
export const fixturePublished = demoPublishedTimetable();
/** CS B: every fixture slot is for it. */
export const csB = fixturePublished.slots[0]!.sectionIds[0]!;
export const csBDepartment = fixtureSnapshot.cohorts.find(
  (c) => c.id === fixtureSnapshot.sections.find((s) => s.id === csB)!.cohortId,
)!.departmentId;

/** Swaps the app's TermSource reads (createTestApp() has no override hook). */
export function useFixtureTermSource(app: INestApplication): void {
  const fake: Pick<TermSource, 'snapshot' | 'published'> = {
    snapshot: (_tenant, termId) =>
      Promise.resolve({
        ...fixtureSnapshot,
        term: { ...fixtureSnapshot.term, id: termId, endDate: TEST_TERM_END },
        cohortWindows: [],
        holidays: [],
        calendarWindows: [],
        extraWorkingDays: [],
      }),
    published: (_tenant, _termId, q: SlotQuery) =>
      Promise.resolve({
        version: fixturePublished.version,
        slots: fixturePublished.slots.filter((s: TimetableSlotV1) =>
          'facultyId' in q
            ? s.faculty.some((f) => f.id === q.facultyId)
            : s.sectionIds.some((id) => q.sectionIds.includes(id)),
        ),
      }),
  };
  Object.assign(app.get(TermSource), fake);
}
