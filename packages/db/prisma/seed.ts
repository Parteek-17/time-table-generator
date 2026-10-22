/**
 * Seeds the fictional "Demo Institute of Engineering": admins, sample logins and the full
 * Phase 1 master data (src/sample/data.ts). Safe to run more than once: master data is only
 * built when the institute has none (`pnpm db:reset` rebuilds it from scratch).
 * No real people or real college branding (CLAUDE.md "Things to avoid").
 */
import { buildSampleInstitute, PrismaClient, SAMPLE_INSTITUTE } from '../src/index';
import { SAMPLE_USERS } from '../src/sample/data';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: rely on the environment (CI, hosted DBs).
}

const prisma = new PrismaClient();

const SEED = {
  institute: { slug: 'demo', name: SAMPLE_INSTITUTE.name },
  platformAdmin: { email: 'platform.admin@slotwise.test', name: 'Platform Admin' },
  instituteAdmin: { email: 'admin@demo.slotwise.test', name: 'Demo Admin' },
} as const;

async function main(): Promise<void> {
  const institute = await prisma.institute.upsert({
    where: { slug: SEED.institute.slug },
    update: {
      name: SEED.institute.name,
      affiliatingUniversityName: SAMPLE_INSTITUTE.affiliatingUniversityName,
    },
    create: {
      slug: SEED.institute.slug,
      name: SEED.institute.name,
      type: 'college',
      timezone: SAMPLE_INSTITUTE.timezone,
      affiliatingUniversityName: SAMPLE_INSTITUTE.affiliatingUniversityName,
    },
  });

  const platformAdmin = await prisma.user.upsert({
    where: { email: SEED.platformAdmin.email },
    update: {},
    create: { ...SEED.platformAdmin, emailVerified: new Date() },
  });
  const instituteAdmin = await prisma.user.upsert({
    where: { email: SEED.instituteAdmin.email },
    update: {},
    create: { ...SEED.instituteAdmin, emailVerified: new Date() },
  });

  // Master data. The seed connects as the owner role, which row-level security does not
  // restrict; the builder only writes rows of this institute.
  const hasMasterData =
    (await prisma.programme.count({ where: { instituteId: institute.id } })) > 0;
  if (hasMasterData) {
    console.log('Master data already present; run `pnpm db:reset` to rebuild it.');
  } else {
    const summary = await prisma.$transaction((tx) => buildSampleInstitute(tx, institute.id), {
      timeout: 120_000,
    });
    console.log(
      `  master data:     ${summary.programmes} programmes, ${summary.courses} courses, ` +
        `${summary.cohorts} cohorts, ${summary.sections} sections, ${summary.faculty} faculty, ` +
        `${summary.rooms} rooms, ${summary.teachingAssignments} teaching assignments`,
    );
  }

  const departments = await prisma.department.findMany({ where: { instituteId: institute.id } });
  const deptId = (code: string) => departments.find((d) => d.code === code)!.id;

  const memberships = [
    {
      userId: instituteAdmin.id,
      role: 'institute_admin',
      scopeType: 'institute',
      scopeId: institute.id,
      instituteId: institute.id,
    },
    {
      userId: platformAdmin.id,
      role: 'platform_admin',
      scopeType: 'platform',
      scopeId: null,
      instituteId: null,
    },
  ] as const;

  // Sample logins for each role (magic link via Mailpit in development).
  const sampleMemberships = [];
  for (const u of SAMPLE_USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, name: u.name, emailVerified: new Date() },
    });
    sampleMemberships.push({
      userId: user.id,
      role: u.role,
      scopeType: u.department ? ('department' as const) : ('institute' as const),
      scopeId: u.department ? deptId(u.department) : institute.id,
      instituteId: institute.id,
    });
    if ('facultyShort' in u) {
      await prisma.faculty.updateMany({
        where: { instituteId: institute.id, shortCode: u.facultyShort, userId: null },
        data: { userId: user.id },
      });
    }
  }

  for (const m of [...memberships, ...sampleMemberships]) {
    const existing = await prisma.membership.findFirst({
      where: { userId: m.userId, role: m.role, scopeId: m.scopeId, revokedAt: null },
    });
    if (!existing) await prisma.membership.create({ data: m });
  }

  console.log(`Seeded "${institute.name}" (${institute.slug})`);
  console.log(`  institute admin: ${SEED.instituteAdmin.email}`);
  console.log(`  platform admin:  ${SEED.platformAdmin.email}`);
  console.log(`  departments:     ${departments.map((d) => d.code).join(', ')}`);
  for (const u of SAMPLE_USERS) console.log(`  ${u.role.padEnd(22)} ${u.email}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
