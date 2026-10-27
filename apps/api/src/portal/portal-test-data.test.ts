/**
 * Test-only master data for P5's e2e tests: term → programme → branch → batch → cohort →
 * section, written with the owner role (Fixtures.owner).
 *
 * Named `*.test.ts` so the production build (tsconfig.build.json) leaves it out; it imports
 * test-only packages. Its own check below runs in every file that imports it (cheap, no I/O).
 */
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@slotwise/db';
import { demoPublishedTimetable, demoTermSnapshot } from '@slotwise/shared/fixtures';
import { describe, expect, it } from 'vitest';
import { FakeMail, signToken, type Fixtures } from '../../test/helpers';
import { AppModule } from '../app.module';
import { loadEnv } from '../config/env';
import { MailService } from '../mail/mail.service';
import { PORTAL_API_BASE } from './timetable.client';

const snapshot = demoTermSnapshot();
export const portalFixture = demoPublishedTimetable();
/** The section every fixture slot is for, and the first slot's first teacher. */
export const fixtureSection = portalFixture.slots
  .map((s) => s.sectionIds)
  .reduce((acc, ids) => acc.filter((id) => ids.includes(id)))[0]!;
export const fixtureTeacher = portalFixture.slots[0]!.faculty[0]!;

describe('P5 test data', () => {
  it('has one section every fixture class is for, and a teacher on the first class', () => {
    expect(portalFixture.slots.every((s) => s.sectionIds.includes(fixtureSection))).toBe(true);
    expect(fixtureTeacher.id).toBeTruthy();
  });
});

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

/**
 * A real HTTP server, so the portal's call to timetable-read.v1 goes over the network.
 * Returns the app and a bearer token per user id.
 */
export async function startPortalApp(
  userIds: readonly string[],
): Promise<{ app: INestApplication; tokens: Map<string, string> }> {
  const env = loadEnv({ ...process.env, NODE_ENV: 'test' });
  let base = '';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
    .overrideProvider(MailService)
    .useValue(new FakeMail())
    .overrideProvider(PORTAL_API_BASE)
    .useValue(() => base)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  const tokens = new Map<string, string>();
  for (const id of userIds) tokens.set(id, await signToken(env, id));
  return { app, tokens };
}

/** The fixture's published week, re-pointed at this test's section and teacher. */
export async function publishFixtureWeek(
  fx: Fixtures,
  ids: {
    instituteId: string;
    termId: string;
    createdById: string;
    sectionId: string;
    facultyId: string;
  },
): Promise<void> {
  const { instituteId, termId, createdById, sectionId, facultyId } = ids;
  const snap = await fx.owner.timetableSnapshot.create({
    data: { instituteId, termId, hash: `p5-${instituteId}`, data: {} },
  });
  const version = await fx.owner.timetableVersion.create({
    data: { instituteId, termId, snapshotId: snap.id, cohortIds: [], createdById },
  });
  const swapSection = (id: string) => (id === fixtureSection ? sectionId : id);
  await fx.owner.timetableSlot.createMany({
    data: portalFixture.slots.map((s, i) => ({
      instituteId,
      versionId: version.id,
      sessionId: `s${i}`,
      assignmentId: s.assignmentId,
      component: s.component,
      courseId: s.course.id,
      courseCode: s.course.code,
      courseShortName: s.course.shortName,
      courseTitle: s.course.title,
      targetKind: s.target.kind,
      targetId: swapSection(s.target.id),
      targetName: s.target.name,
      sectionIds: s.sectionIds.map(swapSection),
      facultyIds: s.faculty.map((f) => (f.id === fixtureTeacher.id ? facultyId : f.id)),
      faculty: s.faculty.map((f) =>
        f.id === fixtureTeacher.id ? { ...f, id: facultyId } : f,
      ) as unknown as Prisma.InputJsonValue,
      roomId: s.room?.id ?? null,
      roomCode: s.room?.code ?? null,
      weekday: s.weekday,
      startPeriod: s.startPeriodIndex,
      length: s.length,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
    })),
  });
  await fx.owner.timetableVersion.update({
    where: { id: version.id },
    data: {
      status: 'published',
      number: 1,
      publishedAt: new Date(),
      validFrom: new Date(`${snapshot.term.startDate}T00:00:00Z`),
    },
  });
}
