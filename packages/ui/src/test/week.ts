import type { GridBell, ViewSlot } from '@slotwise/shared/timetable';

/** Mon–Wed, P1–P4 from 09:00 in 50-minute periods, a short break after P2, lunch after P4. */
export const bell: GridBell = {
  workingDays: [1, 2, 3],
  periods: [
    { index: 1, label: 'P1', startMinute: 540, endMinute: 590 },
    { index: 2, label: 'P2', startMinute: 590, endMinute: 640 },
    { index: 3, label: 'P3', startMinute: 650, endMinute: 700 },
    { index: 4, label: 'P4', startMinute: 700, endMinute: 750 },
  ],
  breaks: [
    { label: 'Short break', afterPeriodIndex: 2, minutes: 10 },
    { label: 'Lunch', afterPeriodIndex: 4, minutes: 40 },
  ],
};

let n = 0;

/** A CS301 lecture for CSE 5A on Monday P1, with `over` applied. */
export function slot(over: Partial<ViewSlot> = {}): ViewSlot {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    versionId: '00000000-0000-4000-8000-000000000000',
    weekday: 1,
    startPeriodIndex: 1,
    length: 1,
    startMinute: 540,
    endMinute: 590,
    assignmentId: '00000000-0000-4000-9000-000000000001',
    component: 'lecture',
    course: { id: 'c1', code: 'CS301', shortName: 'DS', title: 'Data Structures' },
    target: { kind: 'section', id: 's1', name: 'CSE 5A' },
    sectionIds: ['s1'],
    faculty: [{ id: 'f1', name: 'Asha Verma', shortCode: 'AV' }],
    room: { id: 'r1', code: 'G16' },
    locked: false,
    ...over,
  };
}
