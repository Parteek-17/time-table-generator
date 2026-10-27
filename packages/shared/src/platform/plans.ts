/**
 * Plans and their limits (docs/adr/0090-plans-and-limits.md). Prices live with billing, not
 * here: this file only says what an institute on a plan may hold.
 */

export const PLAN_CODES = ['trial', 'college', 'university'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

/** The plan a new institute gets when nobody picks one (sign-up, sample institutes). */
export const DEFAULT_PLAN: PlanCode = 'trial';

/** Things a plan limits. null = no limit. */
export interface PlanLimits {
  departments: number | null;
  sections: number | null;
  faculty: number | null;
  students: number | null;
}
export type LimitKind = keyof PlanLimits;
export const LIMIT_KINDS: readonly LimitKind[] = ['departments', 'sections', 'faculty', 'students'];

export interface Plan {
  code: PlanCode;
  /** Plain name shown to admins. */
  name: string;
  /** Length of the free trial in days; null for paid plans. */
  trialDays: number | null;
  limits: PlanLimits;
}

export const PLANS: Readonly<Record<PlanCode, Plan>> = {
  trial: {
    code: 'trial',
    name: 'Free trial',
    trialDays: 30,
    // Enough for one department's full timetable, or a small college trying everything.
    limits: { departments: 3, sections: 12, faculty: 60, students: 800 },
  },
  college: {
    code: 'college',
    name: 'College',
    trialDays: null,
    limits: { departments: 15, sections: 120, faculty: 400, students: 6000 },
  },
  university: {
    code: 'university',
    name: 'University',
    trialDays: null,
    limits: { departments: null, sections: null, faculty: null, students: null },
  },
};

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === 'string' && (PLAN_CODES as readonly string[]).includes(value);
}

export interface LimitCheck {
  ok: boolean;
  kind: LimitKind;
  limit: number | null;
  used: number;
  /** How many more fit; null = no limit. */
  remaining: number | null;
}

/** May `adding` more of `kind` be created when `used` already exist? */
export function checkLimit(plan: Plan, kind: LimitKind, used: number, adding = 1): LimitCheck {
  const limit = plan.limits[kind];
  if (limit === null) return { ok: true, kind, limit, used, remaining: null };
  return { ok: used + adding <= limit, kind, limit, used, remaining: Math.max(0, limit - used) };
}

export type UsageLevel = 'ok' | 'near' | 'full';
export interface UsageItem {
  kind: LimitKind;
  used: number;
  limit: number | null;
  level: UsageLevel;
}

/** From this share of a limit on, admins see a "nearly full" warning. */
export const NEAR_LIMIT_SHARE = 0.8;

export function usageReport(plan: Plan, usage: Readonly<Record<LimitKind, number>>): UsageItem[] {
  return LIMIT_KINDS.map((kind) => {
    const limit = plan.limits[kind];
    const used = usage[kind];
    let level: UsageLevel = 'ok';
    if (limit !== null && used >= limit) level = 'full';
    else if (limit !== null && used >= limit * NEAR_LIMIT_SHARE) level = 'near';
    return { kind, used, limit, level };
  });
}

/** Last day of the trial as YYYY-MM-DD (dates have no time zone), or null for paid plans. */
export function trialEndDate(plan: Plan, startDate: string): string | null {
  if (plan.trialDays === null) return null;
  return addDays(startDate, plan.trialDays - 1);
}

/** Days left including today; 0 once the trial is over. */
export function trialDaysLeft(trialEndsOn: string, today: string): number {
  const days = Math.round((Date.parse(trialEndsOn) - Date.parse(today)) / 86_400_000) + 1;
  return Math.max(0, days);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
