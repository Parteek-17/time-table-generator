/**
 * P2T seed (run by prisma/seed.ts after P1's): a published timetable (version 1) for the demo
 * institute's term, built from the shared fixtures (`demoTermSnapshot()` + `demoTermSolution()`),
 * so the read API and timetable views have data before generation works end to end.
 *
 * Until P1's snapshot endpoint lands, the fixture's master-data ids are not the seeded
 * database's ids; slots carry their own copies of names, so the timetable still reads
 * correctly. Safe to re-run: skipped when the term already has a timetable version.
 */
import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { demoTermSnapshot, demoTermSolution } from '@slotwise/shared/fixtures';
import { slotsFromPlacements } from '@slotwise/shared/timetable';

export default async function seedP2T(prisma: PrismaClient): Promise<void> {
  const snapshot = demoTermSnapshot();
  const solution = demoTermSolution();

  const institute = await prisma.institute.findUnique({ where: { slug: 'demo' } });
  const term =
    institute &&
    (await prisma.term.findFirst({
      where: { instituteId: institute.id, label: snapshot.term.label, deletedAt: null },
    }));
  if (!institute || !term) {
    console.log(`  p2t: no "${snapshot.term.label}" term in the demo institute; skipped.`);
    return;
  }
  if (await prisma.timetableVersion.count({ where: { termId: term.id } })) {
    console.log('  p2t: the demo term already has a timetable; skipped.');
    return;
  }
  const author = await prisma.membership.findFirst({
    where: {
      instituteId: institute.id,
      role: { in: ['timetable_coordinator', 'institute_admin'] },
    },
    orderBy: { role: 'asc' },
  });
  if (!author) {
    console.log('  p2t: no coordinator or admin in the demo institute; skipped.');
    return;
  }

  const { generatedAt: _generatedAt, ...stable } = snapshot;
  const hash = createHash('sha256').update(JSON.stringify(stable)).digest('hex');
  const data = snapshot as unknown as Prisma.InputJsonValue;
  const stored = await prisma.timetableSnapshot.upsert({
    where: { instituteId_hash: { instituteId: institute.id, hash } },
    update: {},
    create: { instituteId: institute.id, termId: term.id, hash, data },
  });

  const publishedAt = new Date();
  await prisma.$transaction(async (tx) => {
    // Slots can only be written while the version is a draft (timetable_slots_draft_only).
    const version = await tx.timetableVersion.create({
      data: {
        instituteId: institute.id,
        termId: term.id,
        cohortIds: snapshot.cohorts.filter((c) => c.isRunning).map((c) => c.id),
        snapshotId: stored.id,
        unplaced: solution.unplaced as unknown as Prisma.InputJsonValue,
        score: solution.score as unknown as Prisma.InputJsonValue,
        createdById: author.userId,
      },
    });
    await tx.timetableSlot.createMany({
      data: slotsFromPlacements(snapshot, solution.placed).map((slot) => ({
        ...slot,
        faculty: slot.faculty as unknown as Prisma.InputJsonValue,
        instituteId: institute.id,
        versionId: version.id,
      })),
    });
    await tx.timetableVersion.update({
      where: { id: version.id },
      data: {
        status: 'published',
        number: 1,
        publishedAt,
        publishedById: author.userId,
        validFrom: term.startDate,
      },
    });
  });
  console.log(
    `  p2t: published version 1 of "${term.label}" (${solution.placed.length} classes, ` +
      `${solution.unplaced.length} not placed).`,
  );
}
