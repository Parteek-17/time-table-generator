import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, purgeInstitute } from '@slotwise/db';
import { API_JWT_AUDIENCE, API_JWT_ISSUER, type Role } from '@slotwise/shared';
import { SignJWT } from 'jose';
import { AppModule } from '../src/app.module';
import { loadDotEnv, loadEnv, type Env } from '../src/config/env';
import { MailService, type OutgoingMail } from '../src/mail/mail.service';

loadDotEnv();

export class FakeMail {
  readonly sent: OutgoingMail[] = [];
  async send(mail: OutgoingMail): Promise<boolean> {
    this.sent.push(mail);
    return true;
  }
}

export async function createTestApp(): Promise<{
  app: INestApplication;
  env: Env;
  mail: FakeMail;
}> {
  const env = loadEnv({ ...process.env, NODE_ENV: 'test' });
  const mail = new FakeMail();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return { app, env, mail };
}

/** Same token the web app mints (apps/web/src/lib/api.ts). */
export function signToken(env: Env, userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(API_JWT_ISSUER)
    .setAudience(API_JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(env.API_JWT_SECRET));
}

/**
 * Fixtures are written with the owner role (TEST_OWNER_DATABASE_URL) so tests can also
 * clean up the append-only audit log afterwards.
 */
export class Fixtures {
  readonly owner: PrismaClient;
  private readonly run = randomUUID().slice(0, 8);
  private readonly instituteIds: string[] = [];
  private readonly userIds: string[] = [];

  constructor() {
    const url = process.env.TEST_OWNER_DATABASE_URL;
    if (!url) throw new Error('Set TEST_OWNER_DATABASE_URL (see apps/api/.env.example).');
    this.owner = new PrismaClient({ datasources: { db: { url } } });
  }

  async institute(label: string) {
    const institute = await this.owner.institute.create({
      data: { name: `Test ${label} Institute`, slug: `t-${label}-${this.run}` },
    });
    this.instituteIds.push(institute.id);
    const [cse, ece] = await Promise.all(
      ['CSE', 'ECE'].map((code) =>
        this.owner.department.create({
          data: { instituteId: institute.id, code, name: `Test ${code}` },
        }),
      ),
    );
    return { institute, cse: cse!, ece: ece! };
  }

  async user(label: string) {
    const user = await this.owner.user.create({
      data: { email: `${label}-${this.run}@slotwise.test`, name: `Test ${label}` },
    });
    this.userIds.push(user.id);
    return user;
  }

  async grant(
    userId: string,
    role: Role,
    instituteId: string,
    scope: { type: 'institute' } | { type: 'department'; id: string },
  ) {
    return this.owner.membership.create({
      data: {
        userId,
        role,
        instituteId,
        scopeType: scope.type,
        scopeId: scope.type === 'institute' ? instituteId : scope.id,
      },
    });
  }

  async cleanup(): Promise<void> {
    await this.owner.membership.deleteMany({ where: { userId: { in: this.userIds } } });
    for (const id of this.instituteIds) {
      await purgeInstitute(this.owner, id, { includeInstitute: true });
    }
    await this.owner.user.deleteMany({ where: { id: { in: this.userIds } } });
    await this.owner.$disconnect();
  }
}
