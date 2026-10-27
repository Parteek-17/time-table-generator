import 'server-only';

/**
 * One-click sign-in for the fictional demo accounts, for evaluations and demos where nobody can
 * receive the sign-in email (the addresses are made up). Off unless DEMO_LOGINS=true, and only
 * ever for these addresses — never for a real user.
 */
export const DEMO_ACCOUNTS = [
  { email: 'admin@demo.slotwise.test', role: 'institute' },
  { email: 'hod.cse@demo.slotwise.test', role: 'hod' },
  { email: 'coordinator@demo.slotwise.test', role: 'coordinator' },
  { email: 'exams@demo.slotwise.test', role: 'exams' },
  { email: 'faculty@demo.slotwise.test', role: 'faculty' },
  { email: 'student@demo.slotwise.test', role: 'student' },
  { email: 'platform.admin@slotwise.test', role: 'platform' },
] as const;

export type DemoRole = (typeof DEMO_ACCOUNTS)[number]['role'];

export function demoLoginsEnabled(): boolean {
  return process.env.DEMO_LOGINS === 'true';
}
