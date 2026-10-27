/**
 * Links that work without signing in, end to end over real HTTP: a student's calendar feed
 * (iCal), making a new feed link, and a coordinator's public section / room links.
 *
 * Needs P5's `portal_calendar_feeds` and `portal_public_links` tables
 * (requests/2026-10-27-p5-feeds-and-links-migration.md); skips itself without them.
 */
import type { INestApplication } from '@nestjs/common';
import { PortalFeedV1, PublicLinksV1, PublicTimetableV1 } from '@slotwise/shared/portal';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Fixtures } from '../../test/helpers';
import {
  portalFixture as fixture,
  portalMasterData,
  publishFixtureWeek,
  startPortalApp,
} from './portal-test-data.test';

const fx = new Fixtures();
let hasTables = false;
function live(name: string, fn: () => Promise<void>): void {
  it(name, async (ctx) => {
    if (!hasTables) ctx.skip('P5 link tables are not migrated yet');
    await fn();
  });
}

let app: INestApplication;
let tokens = new Map<string, string>();
let a: Awaited<ReturnType<Fixtures['institute']>>;
let b: Awaited<ReturnType<Fixtures['institute']>>;
const u = {} as Record<
  'student' | 'coordinator' | 'hodEce' | 'other',
  { id: string; email: string }
>;
let sectionId: string;
let roomId: string;

const call = (
  method: 'get' | 'post' | 'delete',
  path: string,
  user?: { id: string },
  slug?: string,
) => {
  const req = request(app.getHttpServer())
    [method](path)
    .set('x-institute-slug', slug ?? a.institute.slug);
  return user ? req.set('authorization', `Bearer ${tokens.get(user.id)}`) : req;
};
/** `/ical/<token>.ics` (web path) → the API route. */
const feedRoute = (path: string) => path.replace('/ical/', '/portal/feed/');
const publicRoute = (path: string) => path.replace('/p/', '/portal/public/');

describe('calendar feeds and public links', () => {
  beforeAll(async () => {
    const [check] = await fx.owner.$queryRaw<{ ok: boolean }[]>`
      SELECT to_regclass('portal_public_links') IS NOT NULL AS ok`;
    hasTables = check?.ok === true;
    if (!hasTables) return;
    a = await fx.institute('p5links');
    b = await fx.institute('p5links-b');
    u.student = await fx.user('p5l-student');
    u.coordinator = await fx.user('p5l-coord');
    u.hodEce = await fx.user('p5l-hod-ece');
    u.other = await fx.user('p5l-other');
    const md = await portalMasterData(fx, a.institute.id, a.cse.id);
    sectionId = md.section.id;
    await fx.owner.student.create({
      data: {
        instituteId: a.institute.id,
        batchId: md.batch.id,
        classRollNo: 'P5L01',
        name: 'Feed Student',
        email: u.student.email,
        sectionId,
      },
    });
    const faculty = await fx.owner.faculty.create({
      data: {
        instituteId: a.institute.id,
        employeeCode: 'L1',
        name: 'Link Teacher',
        shortCode: 'LT',
        designation: 'lecturer',
        experience: 'fresher',
        homeDepartmentId: a.cse.id,
        maxPeriodsPerDay: 5,
        maxPeriodsPerWeek: 20,
      },
    });
    const building = await fx.owner.building.create({
      data: { instituteId: a.institute.id, name: 'Main block' },
    });
    // A room the fixture's classes use, so the room's public page has classes.
    const fixtureRoom = fixture.slots.find((s) => s.room)!.room!;
    const room = await fx.owner.room.create({
      data: {
        id: fixtureRoom.id,
        instituteId: a.institute.id,
        code: fixtureRoom.code,
        buildingId: building.id,
        type: 'lecture',
        rows: 6,
        seatsPerRow: 10,
      },
    });
    roomId = room.id;
    await publishFixtureWeek(fx, {
      instituteId: a.institute.id,
      termId: md.term.id,
      createdById: u.coordinator.id,
      sectionId,
      facultyId: faculty.id,
    });
    await fx.grant(u.student.id, 'student', a.institute.id, { type: 'institute' });
    await fx.grant(u.coordinator.id, 'timetable_coordinator', a.institute.id, {
      type: 'institute',
    });
    await fx.grant(u.hodEce.id, 'hod', a.institute.id, { type: 'department', id: a.ece.id });
    await fx.grant(u.other.id, 'institute_admin', b.institute.id, { type: 'institute' });
    ({ app, tokens } = await startPortalApp(Object.values(u).map((x) => x.id)));
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    if (hasTables) {
      const instituteId = { in: [a.institute.id, b.institute.id] };
      // Not yet in purgeInstitute()'s table list (the migration request adds them).
      await fx.owner.portalCalendarFeed.deleteMany({ where: { instituteId } });
      await fx.owner.portalPublicLink.deleteMany({ where: { instituteId } });
    }
    await fx.cleanup();
  });

  live('gives a student a calendar link that serves their classes without signing in', async () => {
    const res = await call('get', '/portal/feed', u.student);
    expect(res.status).toBe(200);
    const feed = PortalFeedV1.parse(res.body);
    expect(feed.path).toMatch(/^\/ical\/[0-9a-f-]{36}\.[A-Za-z0-9_-]{22}\.ics$/);
    // Same link on the next visit.
    expect((await call('get', '/portal/feed', u.student)).body.path).toBe(feed.path);

    const ics = await call('get', feedRoute(feed.path));
    expect(ics.status).toBe(200);
    expect(ics.headers['content-type']).toContain('text/calendar');
    expect(ics.text).toContain('BEGIN:VCALENDAR');
    expect(ics.text).toContain('X-WR-CALNAME:Timetable – CS A');
  });

  live('stops the old calendar link when a new one is made, and refuses forged links', async () => {
    const old = PortalFeedV1.parse((await call('get', '/portal/feed', u.student)).body);
    const fresh = PortalFeedV1.parse((await call('post', '/portal/feed/reset', u.student)).body);
    expect(fresh.path).not.toBe(old.path);
    expect((await call('get', feedRoute(old.path))).status).toBe(404);
    expect((await call('get', feedRoute(fresh.path))).status).toBe(200);
    const forged = fresh.path.replace(/\.[A-Za-z0-9_-]{22}\.ics$/, '.AAAAAAAAAAAAAAAAAAAAAA.ics');
    expect((await call('get', feedRoute(forged))).status).toBe(404);
    // Another institute's address doesn't serve it.
    expect((await call('get', feedRoute(fresh.path), undefined, b.institute.slug)).status).toBe(
      404,
    );
  });

  live(
    'lets a coordinator make one public link per section or room, readable by anyone',
    async () => {
      const list = PublicLinksV1.parse((await call('get', '/portal/links', u.coordinator)).body);
      expect(list.choices.sections).toEqual([{ id: sectionId, label: 'CS A' }]);
      expect(list.choices.rooms.map((r) => r.id)).toContain(roomId);

      const made = await call('post', '/portal/links', u.coordinator).send({
        kind: 'section',
        targetId: sectionId,
      });
      expect(made.status).toBe(201);
      const again = await call('post', '/portal/links', u.coordinator).send({
        kind: 'section',
        targetId: sectionId,
      });
      expect(again.body.path).toBe(made.body.path);

      const page = await call('get', publicRoute(made.body.path));
      expect(page.status).toBe(200);
      const week = PublicTimetableV1.parse(page.body);
      expect(week).toMatchObject({ kind: 'section', label: 'CS A', versionNumber: 1 });
      expect(week.workingDays).toEqual([1, 2, 3, 4, 5]);
      expect(week.classes).toHaveLength(fixture.slots.length);

      const roomLink = await call('post', '/portal/links', u.coordinator).send({
        kind: 'room',
        targetId: roomId,
      });
      const roomWeek = PublicTimetableV1.parse(
        (await call('get', publicRoute(roomLink.body.path))).body,
      );
      expect(roomWeek.label).toMatch(/^Room /);
      expect(roomWeek.classes.length).toBeGreaterThan(0);
      expect(roomWeek.classes.every((c) => c.roomCode === roomWeek.label.slice(5))).toBe(true);

      expect((await call('delete', `/portal/links/${made.body.id}`, u.coordinator)).status).toBe(
        204,
      );
      expect((await call('get', publicRoute(made.body.path))).status).toBe(404);
    },
  );

  live("refuses links for other departments' sections, students and outsiders", async () => {
    // ECE's HOD may share ECE sections only; CS A belongs to CSE.
    const hod = await call('post', '/portal/links', u.hodEce).send({
      kind: 'section',
      targetId: sectionId,
    });
    expect(hod.status).toBe(403);
    expect((await call('get', '/portal/links', u.student)).status).toBe(403);
    expect((await call('get', '/portal/links', u.other)).status).toBe(403);
    expect(
      (
        await call('post', '/portal/links', u.coordinator).send({
          kind: 'section',
          targetId: 'nope',
        })
      ).status,
    ).toBe(400);
  });
});
