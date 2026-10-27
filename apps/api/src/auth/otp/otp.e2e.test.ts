/**
 * Student sign-in by roll number + one-time code, end to end: the code goes by email (only
 * its hash is stored), the right code creates the login and a student membership, wrong
 * codes are counted, sends are limited, another institute's roll numbers are invisible.
 *
 * Needs P5's `portal_login_codes` table (requests/2026-10-27-p5-login-codes-migration.md).
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type FakeMail, Fixtures } from '../../../test/helpers';
import { portalMasterData } from '../../portal/portal-test-data.test';

const fx = new Fixtures();
/** False until INT's migration adds portal_login_codes (CI before it): tests skip. */
let hasTable = false;

/** A test that skips itself when the table is missing. */
function live(name: string, fn: () => Promise<void>): void {
  it(name, async (ctx) => {
    if (!hasTable) ctx.skip('portal_login_codes is not migrated yet');
    await fn();
  });
}
let app: INestApplication;
let mail: FakeMail;
let a: Awaited<ReturnType<Fixtures['institute']>>;
let b: Awaited<ReturnType<Fixtures['institute']>>;
let sectionId: string;
let studentId: string;
const ROLL = 'P5-OTP-01';
let email: string;

const post = (path: string, body: object, slug = a.institute.slug) =>
  request(app.getHttpServer()).post(path).set('x-institute-slug', slug).send(body);

/** The code from the newest email to the student. */
function lastCode(): string {
  const sent = mail.sent.filter((m) => m.to === email).at(-1);
  return /^(\d{6}) /.exec(sent?.subject ?? '')?.[1] ?? '';
}

describe('student sign-in by one-time code', () => {
  beforeAll(async () => {
    const [check] = await fx.owner.$queryRaw<{ ok: boolean }[]>`
      SELECT to_regclass('portal_login_codes') IS NOT NULL AS ok`;
    hasTable = check?.ok === true;
    if (!hasTable) return;
    ({ app, mail } = await createTestApp());
    a = await fx.institute('p5otp-a');
    b = await fx.institute('p5otp-b');
    const md = await portalMasterData(fx, a.institute.id, a.cse.id);
    sectionId = md.section.id;
    email = `p5-otp-${a.institute.slug}@slotwise.test`;
    const student = await fx.owner.student.create({
      data: {
        instituteId: a.institute.id,
        batchId: md.batch.id,
        classRollNo: ROLL,
        name: 'Code Student',
        email: email.toUpperCase(),
        sectionId,
      },
    });
    studentId = student.id;
    await fx.owner.student.create({
      data: {
        instituteId: a.institute.id,
        batchId: md.batch.id,
        classRollNo: 'P5-NO-EMAIL',
        name: 'No Email',
      },
    });
  }, 120_000);

  beforeEach(async () => {
    if (!hasTable) return;
    await fx.owner.portalLoginCode.deleteMany({ where: { studentId } });
  });

  afterAll(async () => {
    await app?.close();
    if (!hasTable) return fx.cleanup();
    const user = await fx.owner.user.findUnique({ where: { email } });
    if (user) {
      await fx.owner.membership.deleteMany({ where: { userId: user.id } });
      await fx.owner.auditLog.deleteMany({ where: { actorUserId: user.id } });
    }
    // Not yet in purgeInstitute()'s table list (the migration request adds it).
    await fx.owner.portalLoginCode.deleteMany({
      where: { instituteId: { in: [a.institute.id, b.institute.id] } },
    });
    await fx.cleanup();
    if (user) await fx.owner.user.deleteMany({ where: { id: user.id } }).catch(() => undefined);
  });

  live('emails a code to the address on the record and stores only its hash', async () => {
    const res = await post('/auth/otp/request', { rollNumber: ` ${ROLL.toLowerCase()} ` });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      maskedEmail: expect.stringContaining('@slotwise.test'),
      expiresInMinutes: 10,
    });
    expect(res.body.maskedEmail).not.toBe(email);
    const code = lastCode();
    expect(code).toMatch(/^\d{6}$/);
    const rows = await fx.owner.portalLoginCode.findMany({ where: { studentId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.codeHash).not.toContain(code);
  });

  live(
    'signs in with the right code once, creating the login and a section membership',
    async () => {
      await post('/auth/otp/request', { rollNumber: ROLL });
      const code = lastCode();
      const ok = await post('/auth/otp/verify', { rollNumber: ROLL, code });
      expect(ok.status).toBe(200);
      expect(ok.body).toEqual({ email });
      const user = await fx.owner.user.findUniqueOrThrow({ where: { email } });
      const memberships = await fx.owner.membership.findMany({ where: { userId: user.id } });
      expect(memberships).toEqual([
        expect.objectContaining({ role: 'student', scopeType: 'section', scopeId: sectionId }),
      ]);

      const again = await post('/auth/otp/verify', { rollNumber: ROLL, code });
      expect(again.status).toBe(400);
      expect(again.body.message).toContain('expired or was already used');
      // Signing in again does not add a second membership.
      await post('/auth/otp/request', { rollNumber: ROLL });
      expect((await post('/auth/otp/verify', { rollNumber: ROLL, code: lastCode() })).status).toBe(
        200,
      );
      expect(await fx.owner.membership.count({ where: { userId: user.id } })).toBe(1);
    },
  );

  live('counts wrong codes and stops after five', async () => {
    await post('/auth/otp/request', { rollNumber: ROLL });
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    const first = await post('/auth/otp/verify', { rollNumber: ROLL, code: wrong });
    expect(first.status).toBe(400);
    expect(first.body.message).toContain('4 tries left');
    for (let i = 0; i < 4; i += 1)
      await post('/auth/otp/verify', { rollNumber: ROLL, code: wrong });
    const locked = await post('/auth/otp/verify', { rollNumber: ROLL, code });
    expect(locked.status).toBe(429);
  });

  live('allows three codes per 15 minutes; only the newest works', async () => {
    await post('/auth/otp/request', { rollNumber: ROLL });
    const old = lastCode();
    await post('/auth/otp/request', { rollNumber: ROLL });
    const newest = lastCode();
    expect((await post('/auth/otp/request', { rollNumber: ROLL })).status).toBe(200);
    const fourth = await post('/auth/otp/request', { rollNumber: ROLL });
    expect(fourth.status).toBe(429);
    if (old !== newest) {
      expect((await post('/auth/otp/verify', { rollNumber: ROLL, code: old })).status).toBe(400);
    }
  });

  live('explains unknown roll numbers, missing emails and bad input in plain words', async () => {
    const unknown = await post('/auth/otp/request', { rollNumber: 'NOPE-1' });
    expect(unknown.status).toBe(404);
    expect(unknown.body.message).toContain('couldn’t find roll number NOPE-1');
    const noEmail = await post('/auth/otp/request', { rollNumber: 'P5-NO-EMAIL' });
    expect(noEmail.status).toBe(422);
    expect(noEmail.body.message).toContain('no email address');
    expect((await post('/auth/otp/verify', { rollNumber: ROLL, code: '12ab' })).status).toBe(400);
  });

  live("never finds another institute's students", async () => {
    const res = await post('/auth/otp/request', { rollNumber: ROLL }, b.institute.slug);
    expect(res.status).toBe(404);
  });
});
