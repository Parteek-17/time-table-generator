import { SETUP_STEPS, type ImportKindName, type SetupStep } from '@slotwise/shared';

/** Where each step's data is edited later, outside the wizard. */
export const STEP_HOME: Readonly<Record<SetupStep, string | null>> = {
  profile: '/settings/institute',
  departments: '/departments',
  programmes: '/programmes',
  schemes: '/schemes',
  term: '/terms',
  cohorts: '/cohorts',
  faculty: '/faculty',
  rooms: '/rooms',
  bell: '/bell-schedules',
  calendar: '/calendar',
  teaching: '/teaching',
  ready: '/readiness',
};

/** Sheets that fill a step, offered as "Have this in Excel already? Import …". */
export const STEP_IMPORTS: Readonly<Partial<Record<SetupStep, readonly ImportKindName[]>>> = {
  departments: ['departments'],
  programmes: ['programmes'],
  schemes: ['courses'],
  cohorts: ['batches_sections', 'students'],
  faculty: ['faculty'],
  rooms: ['rooms'],
  calendar: ['holidays'],
  teaching: ['teaching_assignments'],
};

export function isStep(value: string): value is SetupStep {
  return (SETUP_STEPS as readonly string[]).includes(value);
}

export function neighbours(step: SetupStep): { prev: SetupStep | null; next: SetupStep | null } {
  const i = SETUP_STEPS.indexOf(step);
  return { prev: SETUP_STEPS[i - 1] ?? null, next: SETUP_STEPS[i + 1] ?? null };
}
