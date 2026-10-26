/**
 * Downloads end to end: Excel for one section (lab blocks merged) and for every room (a sheet
 * each), a PDF for one teacher, and drafts kept from people who can't edit.
 *
 * Needs the timetable tables; skipped until INT's migration is in (as the read test). The PDF
 * test also needs Chrome or Edge (PDF_BROWSER_PATH or the usual install places).
 */
import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Prisma } from '@slotwise/db';
import { demoTermSnapshot, demoTermSolution } from '@slotwise/shared/fixtures';
import { slotsFromPlacements, viewChoices } from '@slotwise/shared/timetable';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, Fixtures, signToken } from '../../test/helpers';
import { findBrowser } from './export/pdf';

const fx = new Fixtures();
let hasTables = false;

function live(name: string, fn: () => Promise<void>): void {
  it(
    name,
    async (ctx) => {
      if (!hasTables) ctx.skip('timetable tables are not migrated yet');
      await fn();
    },
    60_000,
  );
}

const snapshot = demoTermSnapshot();
const choices = viewChoices(snapshot);
let app: INestApplication;
let a: Awaited<ReturnType<Fixtures['institute']>>;
const tokens = new Map<string, string>();
const u = {} as Record<'coord' | 'student', { id: string }>;
const ids = { published: '', draft: '' };

/** Binary GET as `userId`; the body comes back as a Buffer. */
const download = (userId: string, versionId: string, query: string) =>
  request(app.getHttpServer())
    .get(`/timetable/versions/${versionId}/export?${query}`)
    .set('x-institute-slug', a.institute.slug)
    .set('authorization', `Bearer ${tokens.get(userId)}`)
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });

describe('timetable downloads', () => {
  beforeAll(async () => {
    const [check] = await fx.owner.$queryRaw<{ ok: boolean }[]>`
      SELECT to_regclass('timetable_slots') IS NOT NULL AS ok`;
    hasTables = check?.ok === true;
    if (!hasTables) return;
    let env;
    ({ app, env } = await createTestApp());
    a = await fx.institute('export-a');
    for (const key of ['coord', 'student'] as const) {
      u[key] = await fx.user(`export-${key}`);
      tokens.set(u[key].id, await signToken(env, u[key].id));
    }
    await fx.grant(u.coord.id, 'timetable_coordinator', a.institute.id, { type: 'institute' });
    await fx.grant(u.student.id, 'student', a.institute.id, { type: 'institute' });
    const instituteId = a.institute.id;
    const session = await fx.owner.academicSession.create({
      data: { instituteId, name: '2026-27', startYear: 2026 },
    });
    const termId = (
      await fx.owner.term.create({
        data: {
          instituteId,
          sessionId: session.id,
          kind: 'odd',
          label: snapshot.term.label,
          startDate: new Date(`${snapshot.term.startDate}T00:00:00Z`),
          endDate: new Date(`${snapshot.term.endDate}T00:00:00Z`),
        },
      })
    ).id;
    const snap = await fx.owner.timetableSnapshot.create({
      data: {
        instituteId,
        termId,
        hash: createHash('sha256').update('export').digest('hex'),
        data: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
    for (const status of ['draft', 'published'] as const) {
      const v = await fx.owner.timetableVersion.create({
        data: {
          instituteId,
          termId,
          snapshotId: snap.id,
          cohortIds: snapshot.cohorts.map((c) => c.id),
          createdById: u.coord.id,
        },
      });
      await fx.owner.timetableSlot.createMany({
        data: slotsFromPlacements(snapshot, demoTermSolution().placed).map((slot) => ({
          ...slot,
          faculty: slot.faculty as unknown as Prisma.InputJsonValue,
          instituteId,
          versionId: v.id,
        })),
      });
      if (status === 'published') {
        await fx.owner.timetableVersion.update({
          where: { id: v.id },
          data: { status, number: 1, publishedAt: new Date(), validFrom: new Date('2026-07-27') },
        });
      }
      ids[status] = v.id;
    }
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    if (hasTables && a) {
      const instituteId = a.institute.id;
      await fx.owner.timetableVersion.deleteMany({ where: { instituteId } });
      await fx.owner.timetableSnapshot.deleteMany({ where: { instituteId } });
    }
    await fx.cleanup();
  });

  live("a section's week as Excel, with lab blocks merged", async () => {
    const section = choices.section[0]!;
    const res = await download(
      u.student.id,
      ids.published,
      `format=xlsx&kind=section&id=${section.id}`,
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toMatch(/filename="timetable-.+-v1\.xlsx"/);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(res.body as Buffer);
    expect(book.worksheets).toHaveLength(1);
    const sheet = book.worksheets[0]!;
    expect(sheet.getCell('A1').value).toBe(section.name);
    expect(String(sheet.getCell('A2').value)).toContain('Version 1, from 2026-07-27');
    expect(sheet.getCell('A3').value).toBe('Day');
    expect(sheet.getCell('A4').value).toBe('Monday');
    // Title, subtitle and at least one lab block.
    const merges = (sheet.model as { merges?: string[] }).merges ?? [];
    expect(merges.length).toBeGreaterThan(2);
  });

  live('every room as Excel, one sheet each', async () => {
    const res = await download(u.coord.id, ids.published, 'format=xlsx&kind=room');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('timetable-rooms-v1.xlsx');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(res.body as Buffer);
    expect(book.worksheets.map((s) => s.name)).toEqual(choices.room.map((r) => r.name));
  });

  live("a teacher's week as PDF", async () => {
    if (!findBrowser(process.env.PDF_BROWSER_PATH)) return;
    const teacher = choices.faculty[0]!;
    const res = await download(
      u.student.id,
      ids.published,
      `format=pdf&kind=faculty&id=${teacher.id}`,
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  live('drafts are for editors only', async () => {
    expect((await download(u.student.id, ids.draft, 'format=xlsx&kind=section')).status).toBe(403);
    const res = await download(u.coord.id, ids.draft, 'format=xlsx&kind=section');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('timetable-sections-draft.xlsx');
  });

  live('an unknown section is a 404, a bad format a 400', async () => {
    const missing = '00000000-0000-4000-8000-000000000999';
    expect(
      (await download(u.coord.id, ids.published, `format=xlsx&kind=section&id=${missing}`)).status,
    ).toBe(404);
    expect((await download(u.coord.id, ids.published, 'format=doc&kind=section')).status).toBe(400);
  });
});
