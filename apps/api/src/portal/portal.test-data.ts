/**
 * Test-only master data for P5's e2e tests: term → programme → branch → batch → cohort →
 * section, written with the owner role (Fixtures.owner).
 */
import { demoTermSnapshot } from '@slotwise/shared/fixtures';
import type { Fixtures } from '../../test/helpers';

const snapshot = demoTermSnapshot();

export async function portalMasterData(fx: Fixtures, instituteId: string, departmentId: string) {
  const session = await fx.owner.academicSession.create({
    data: { instituteId, name: '2026-27', startYear: 2026 },
  });
  const term = await fx.owner.term.create({
    data: {
      instituteId,
      sessionId: session.id,
      kind: 'odd',
      label: snapshot.term.label,
      status: 'active',
      startDate: new Date(`${snapshot.term.startDate}T00:00:00Z`),
      endDate: new Date(`${snapshot.term.endDate}T00:00:00Z`),
    },
  });
  const programme = await fx.owner.programme.create({
    data: { instituteId, code: 'BTECH', name: 'B.Tech', level: 'ug', totalSemesters: 8 },
  });
  const branch = await fx.owner.branch.create({
    data: { instituteId, programmeId: programme.id, code: 'CSE', name: 'CSE', departmentId },
  });
  const scheme = await fx.owner.schemeVersion.create({
    data: { instituteId, programmeId: programme.id, name: '2024' },
  });
  const batch = await fx.owner.batch.create({
    data: {
      instituteId,
      programmeId: programme.id,
      branchId: branch.id,
      admissionYear: 2025,
      schemeVersionId: scheme.id,
    },
  });
  const cohort = await fx.owner.cohort.create({
    data: { instituteId, batchId: batch.id, termId: term.id, semester: 3, displayCode: 'D2 CSE' },
  });
  const section = await fx.owner.section.create({
    data: { instituteId, cohortId: cohort.id, name: 'A', displayName: 'CS A', strength: 60 },
  });
  await fx.owner.bellSchedule.create({
    data: { instituteId, name: 'Default', workingDays: [1, 2, 3, 4, 5], isDefault: true },
  });
  return { term, batch, section };
}
