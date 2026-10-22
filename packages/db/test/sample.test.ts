/**
 * The sample institute ("Try with sample data", `pnpm db:seed`) must produce exactly the
 * readiness issues it leaves on purpose (PLANNED_GAPS), and build under row-level security
 * as the restricted app role, the way the API will run it.
 */
import { randomUUID } from 'node:crypto';
import { readiness, type ReadinessResult } from '@slotwise/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildSampleInstitute,
  loadReadinessSnapshot,
  PrismaClient,
  purgeInstitute,
  withTenant,
  type SampleSummary,
} from '../src/index';

for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // CI passes the URLs as environment variables.
  }
}

const owner = new PrismaClient({ datasources: { db: { url: process.env.OWNER_DATABASE_URL } } });
const app = new PrismaClient({ datasources: { db: { url: process.env.APP_DATABASE_URL } } });

let instituteId = '';
let summary: SampleSummary;
let result: ReadinessResult;

beforeAll(async () => {
  const institute = await owner.institute.create({
    data: {
      name: 'Sample Test Institute',
      slug: `sample-${randomUUID().slice(0, 8)}`,
      isSample: true,
    },
  });
  instituteId = institute.id;
  // As the app role, with RLS set to the new institute: what "Try with sample data" does.
  summary = await app.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.institute_id', ${instituteId}, true)`;
      return buildSampleInstitute(tx, instituteId);
    },
    { timeout: 120_000 },
  );
  const snapshot = await withTenant(app, { instituteId, userId: null }, (tx) =>
    loadReadinessSnapshot(tx, summary.termId),
  );
  result = readiness(snapshot);
}, 180_000);

afterAll(async () => {
  if (instituteId) await purgeInstitute(owner, instituteId, { includeInstitute: true });
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

describe('sample institute', () => {
  it('has the size the brief asks for', () => {
    expect(summary).toMatchObject({
      departments: 5,
      programmes: 4,
      cohorts: 20,
      faculty: 44,
      rooms: 23,
    });
    expect(summary.sections).toBeGreaterThanOrEqual(20);
  });

  it('readiness reports exactly the planned gaps', () => {
    expect(result.issues.map((i) => [i.severity, i.code, i.message])).toEqual([
      ['error', 'cohort_without_sections', 'MBA S1 has no sections yet.'],
      [
        'error',
        'subgroups_dont_add_up',
        'ME A (ME S3) has 40 students but its sub-groups add up to 38.',
      ],
      ['error', 'missing_assignment', 'ECE S3: no teacher for EC201 NA (T) in EC A.'],
      [
        'error',
        'faculty_overloaded',
        'Dr. Meera Iyer (MI) has 15 periods a week; their limit is 14.',
      ],
      ['error', 'no_room_of_type', 'There is no drawing hall. ME101 EG for CSE S1 needs one.'],
      [
        'warning',
        'teaching_days_short',
        'BCA S1, CSE S1, ECE S1, MBA S1, ME S1, MTECH CSE S1: 80 teaching days, 10 short of 90. Make 9 Saturdays working days to catch up.',
      ],
      [
        'warning',
        'teaching_days_short',
        'CSE S3 LEET: 85 teaching days, 5 short of 90. Make 5 Saturdays working days to catch up.',
      ],
    ]);
    expect(result).toMatchObject({ ready: false, errorCount: 5, warningCount: 2 });
  });

  it('2nd year onwards reach the minimum teaching days', () => {
    const seniors = result.teachingDays.filter((d) => !/S1$|LEET$/.test(d.displayCode));
    expect(seniors.length).toBeGreaterThan(0);
    for (const d of seniors) expect(d.teachingDays).toBe(90);
  });

  it('2nd-year CSE is fully assigned; only the planned teacher is overloaded', () => {
    expect(result.issues.some((i) => i.message.startsWith('CSE S3:'))).toBe(false);
    expect(result.facultyLoad.filter((f) => f.status === 'over').map((f) => f.shortCode)).toEqual([
      'MI',
    ]);
  });

  it('is invisible to other institutes', async () => {
    const elsewhere = await withTenant(app, { instituteId: randomUUID(), userId: null }, (tx) =>
      Promise.all([tx.course.count(), tx.faculty.count(), tx.teachingAssignment.count()]),
    );
    expect(elsewhere).toEqual([0, 0, 0]);
  });
});
