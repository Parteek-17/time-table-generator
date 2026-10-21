/**
 * Seeds one fictional institute with two admins. Safe to run more than once.
 * No real people or real college branding (CLAUDE.md "Things to avoid").
 */
import { PrismaClient } from '../src/index';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: rely on the environment (CI, hosted DBs).
}

const prisma = new PrismaClient();

const SEED = {
  institute: { slug: 'demo', name: 'Demo Institute of Engineering' },
  platformAdmin: { email: 'platform.admin@slotwise.test', name: 'Platform Admin' },
  instituteAdmin: { email: 'admin@demo.slotwise.test', name: 'Demo Admin' },
  departments: [
    { code: 'CSE', name: 'Computer Science and Engineering' },
    { code: 'ECE', name: 'Electronics and Communication Engineering' },
    { code: 'AS', name: 'Applied Sciences' },
  ],
} as const;

async function main(): Promise<void> {
  const institute = await prisma.institute.upsert({
    where: { slug: SEED.institute.slug },
    update: { name: SEED.institute.name },
    create: {
      slug: SEED.institute.slug,
      name: SEED.institute.name,
      type: 'college',
      timezone: 'Asia/Kolkata',
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

  // The seed connects as the owner role, which row-level security does not restrict.
  for (const d of SEED.departments) {
    await prisma.department.upsert({
      where: { instituteId_code: { instituteId: institute.id, code: d.code } },
      update: { name: d.name },
      create: { ...d, instituteId: institute.id },
    });
  }

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
  for (const m of memberships) {
    const existing = await prisma.membership.findFirst({
      where: { userId: m.userId, role: m.role, scopeId: m.scopeId, revokedAt: null },
    });
    if (!existing) await prisma.membership.create({ data: m });
  }

  console.log(`Seeded "${institute.name}" (${institute.slug})`);
  console.log(`  institute admin: ${SEED.instituteAdmin.email}`);
  console.log(`  platform admin:  ${SEED.platformAdmin.email}`);
  console.log(`  departments:     ${SEED.departments.map((d) => d.code).join(', ')}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
