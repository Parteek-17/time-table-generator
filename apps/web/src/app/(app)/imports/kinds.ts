import type { ImportKindName } from '@slotwise/shared';

/** Order on the Import page: each sheet may refer to the ones above it. */
export const KIND_ORDER: readonly ImportKindName[] = [
  'departments',
  'programmes',
  'courses',
  'rooms',
  'faculty',
  'batches_sections',
  'students',
  'holidays',
  'teaching_assignments',
];

/** Where the imported data is shown and edited afterwards. */
export const KIND_PAGE: Readonly<Record<ImportKindName, string>> = {
  departments: '/departments',
  programmes: '/programmes',
  courses: '/schemes',
  rooms: '/rooms',
  faculty: '/faculty',
  batches_sections: '/cohorts',
  students: '/students',
  holidays: '/calendar',
  teaching_assignments: '/cohorts',
};

export function isKind(value: string | undefined): value is ImportKindName {
  return value != null && (KIND_ORDER as readonly string[]).includes(value);
}
