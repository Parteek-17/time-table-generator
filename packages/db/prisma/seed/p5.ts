/**
 * P5 seed (run by prisma/seed.ts after P1's and P2T's): a sample student login for the
 * portals, so "Today" can be tried as a student. P1's sample teacher login
 * (faculty@demo.slotwise.test) already serves as the teacher.
 *
 * The student is "Demo Student" (roll DEMO-S001) in section CS B of the demo term, matched to
 * the sign-in by email. Fictional. Safe to re-run.
 */
import type { PrismaClient } from '@prisma/client';

const STUDENT = {
  email: 'student@demo.slotwise.test',
  name: 'Demo Student',
  rollNo: 'DEMO-S001',
  section: 'CS B',
};

export default async function seedP5(prisma: PrismaClient): Promise<void> {
  const institute = await prisma.institute.findUnique({ where: { slug: 'demo' } });
  const section =
    institute &&
    (await prisma.section.findFirst({
      where: { instituteId: institute.id, displayName: STUDENT.section, deletedAt: null },
      include: { cohort: { select: { batchId: true } } },
      orderBy: { createdAt: 'desc' },
    }));
  if (!institute || !section) {
    console.log(`  p5: no section ${STUDENT.section} in the demo institute; skipped.`);
    return;
  }

  const user = await prisma.user.upsert({
    where: { email: STUDENT.email },
    update: {},
    create: { email: STUDENT.email, name: STUDENT.name, emailVerified: new Date() },
  });
  await prisma.student.upsert({
    where: { instituteId_classRollNo: { instituteId: institute.id, classRollNo: STUDENT.rollNo } },
    update: {},
    create: {
      instituteId: institute.id,
      batchId: section.cohort.batchId,
      classRollNo: STUDENT.rollNo,
      name: STUDENT.name,
      email: STUDENT.email,
      sectionId: section.id,
    },
  });
  const membership = {
    userId: user.id,
    role: 'student' as const,
    scopeType: 'section' as const,
    scopeId: section.id,
    instituteId: institute.id,
  };
  const existing = await prisma.membership.findFirst({
    where: { userId: user.id, role: 'student', scopeId: section.id, revokedAt: null },
  });
  if (!existing) await prisma.membership.create({ data: membership });
  console.log(`  p5: student login ${STUDENT.email} (${STUDENT.section}, roll ${STUDENT.rollNo})`);
}
