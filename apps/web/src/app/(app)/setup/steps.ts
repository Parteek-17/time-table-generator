import { SETUP_STEPS, type SetupStep } from '@slotwise/shared';

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
  teaching: null,
  ready: null,
};

export function isStep(value: string): value is SetupStep {
  return (SETUP_STEPS as readonly string[]).includes(value);
}

export function neighbours(step: SetupStep): { prev: SetupStep | null; next: SetupStep | null } {
  const i = SETUP_STEPS.indexOf(step);
  return { prev: SETUP_STEPS[i - 1] ?? null, next: SETUP_STEPS[i + 1] ?? null };
}
