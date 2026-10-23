/**
 * Builds the contract fixtures in packages/shared/fixtures from the seeded sample institute
 * ("Demo Institute of Engineering", `pnpm db:seed`). Run: `pnpm fixtures:build`.
 *
 * Everything is fictional. The timetable "solution" comes from a simple greedy placer so other
 * streams have realistic data before the real solver (P2E) exists; it is not optimised.
 * Generated ids (slots, students, papers) are derived from names, so re-running on the same
 * database gives the same files. Owner connection: no row-level security, so every query is
 * filtered by the demo institute explicitly.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bellScheduleFor,
  blockStarts,
  classCapacity,
  roomFits,
  roomNeedFor,
  scopeApplies,
  type Component,
  type RoomType,
} from '@slotwise/shared';
import {
  PlacedSessionV1,
  SetupSnapshotV1,
  SolverSeatingRequestV1,
  SolverSeatingResponseV1,
  SolverTimetableResponseV1,
  TimetableReadResponseV1,
  TodayV1,
  sessionLengths,
  type SnapshotAssignmentV1,
  type TimetableSlotV1,
  type UnplacedSessionV1,
} from '@slotwise/shared/contracts';
import { PrismaClient } from '../src/index';

// .env.local (stream worktree overrides, scripts/stream-env.mjs) wins over .env.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // No .env file: rely on the environment.
  }
}

const OUT = join(__dirname, '..', '..', 'shared', 'fixtures');
const prisma = new PrismaClient();
const live = { deletedAt: null };
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Deterministic uuid (version 5 layout) from a name. */
function uuidFrom(name: string): string {
  const h = createHash('sha1').update(`slotwise-fixture:${name}`).digest('hex');
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function write(name: string, data: unknown): void {
  writeFileSync(join(OUT, name), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`  wrote ${name}`);
}

async function buildSnapshot(): Promise<SetupSnapshotV1> {
  const institute = await prisma.institute.findUniqueOrThrow({ where: { slug: 'demo' } });
  const instituteId = institute.id;
  const where = { instituteId, ...live };
  const term = await prisma.term.findFirstOrThrow({ where: { ...where, status: 'active' } });
  const termWhere = { ...where, termId: term.id };

  const [cohorts, bells, holidays, windows, extraDays, cohortWindows] = await Promise.all([
    prisma.cohort.findMany({
      where: termWhere,
      include: { batch: { include: { branch: true } } },
      orderBy: [{ semester: 'asc' }, { displayCode: 'asc' }],
    }),
    prisma.bellSchedule.findMany({
      where,
      include: { periods: true, breaks: true, programmes: true },
      orderBy: { name: 'asc' },
    }),
    prisma.holiday.findMany({
      where: { ...where, endDate: { gte: term.startDate }, startDate: { lte: term.endDate } },
      orderBy: { startDate: 'asc' },
    }),
    prisma.calendarWindow.findMany({ where: termWhere, orderBy: { startDate: 'asc' } }),
    prisma.extraWorkingDay.findMany({ where: termWhere, orderBy: { date: 'asc' } }),
    prisma.termCohortWindow.findMany({ where: termWhere }),
  ]);
  const cohortIds = cohorts.map((c) => c.id);
  const [sections, electives, assignments, faculty, rooms, fixedSlots] = await Promise.all([
    prisma.section.findMany({
      where: { ...where, cohortId: { in: cohortIds } },
      include: { subGroups: { where: live, orderBy: { name: 'asc' } } },
      orderBy: { displayName: 'asc' },
    }),
    prisma.electiveSection.findMany({
      where: termWhere,
      include: { sources: true },
      orderBy: { name: 'asc' },
    }),
    prisma.teachingAssignment.findMany({
      where: termWhere,
      include: { faculty: true },
      orderBy: [{ courseId: 'asc' }, { component: 'asc' }, { id: 'asc' }],
    }),
    prisma.faculty.findMany({
      where,
      include: { unavailability: true },
      orderBy: { shortCode: 'asc' },
    }),
    prisma.room.findMany({ where, include: { building: true }, orderBy: { code: 'asc' } }),
    prisma.fixedSlot.findMany({ where: termWhere, include: { faculty: true } }),
  ]);
  const schemeIds = [...new Set(cohorts.map((c) => c.batch.schemeVersionId))];
  const courses = await prisma.course.findMany({
    where: { ...where, schemeVersionId: { in: schemeIds } },
    include: { branches: true },
    orderBy: [{ semester: 'asc' }, { code: 'asc' }],
  });
  const courseById = new Map(courses.map((c) => [c.id, c]));

  const scope = <
    T extends {
      scopeType: SetupSnapshotV1['holidays'][number]['scopeType'];
      departmentId: string | null;
      programmeId: string | null;
      cohortId: string | null;
      sectionId: string | null;
    },
  >(
    r: T,
  ) => ({
    scopeType: r.scopeType,
    departmentId: r.departmentId,
    programmeId: r.programmeId,
    cohortId: r.cohortId,
    sectionId: r.sectionId,
  });

  const periodsFor = (courseId: string, component: Component): number => {
    const c = courseById.get(courseId)!;
    return component === 'lecture'
      ? c.lectures
      : component === 'tutorial'
        ? c.tutorials
        : c.practicals;
  };

  return SetupSnapshotV1.parse({
    version: 'setup-snapshot.v1',
    generatedAt: '2026-10-22T00:00:00.000Z',
    instituteId,
    timezone: institute.timezone,
    term: {
      id: term.id,
      label: term.label,
      kind: term.kind,
      status: term.status,
      startDate: iso(term.startDate),
      endDate: iso(term.endDate),
      minTeachingDays: term.minTeachingDays,
    },
    scope: null,
    bellSchedules: bells.map((b) => ({
      id: b.id,
      name: b.name,
      isDefault: b.isDefault,
      workingDays: [...b.workingDays].sort(),
      periods: b.periods
        .sort((x, y) => x.index - y.index)
        .map((p) => ({
          index: p.index,
          label: p.label,
          startMinute: p.startMinute,
          endMinute: p.endMinute,
        })),
      breaks: b.breaks.map((x) => ({
        label: x.label,
        afterPeriodIndex: x.afterPeriodIndex,
        minutes: x.minutes,
      })),
      overrides: b.programmes.map((o) => ({ programmeId: o.programmeId, semesters: o.semesters })),
    })),
    holidays: holidays.map((h) => ({
      ...scope(h),
      id: h.id,
      name: h.name,
      startDate: iso(h.startDate),
      endDate: iso(h.endDate),
    })),
    calendarWindows: windows.map((w) => ({
      ...scope(w),
      id: w.id,
      type: w.type,
      label: w.label,
      startDate: iso(w.startDate),
      endDate: iso(w.endDate),
    })),
    extraWorkingDays: extraDays.map((d) => ({
      ...scope(d),
      id: d.id,
      date: iso(d.date),
      followsWeekday: d.followsWeekday,
    })),
    cohortWindows: cohortWindows.map((w) => ({
      id: w.id,
      programmeId: w.programmeId,
      semesters: w.semesters,
      entryType: w.entryType,
      teachingStart: iso(w.teachingStart),
      prepHolidaysStart: w.prepHolidaysStart ? iso(w.prepHolidaysStart) : null,
      endSemExamStart: w.endSemExamStart ? iso(w.endSemExamStart) : null,
    })),
    cohorts: cohorts.map((c) => ({
      id: c.id,
      displayCode: c.displayCode,
      semester: c.semester,
      isRunning: c.isRunning,
      entryType: c.batch.entryType,
      schemeVersionId: c.batch.schemeVersionId,
      programmeId: c.batch.programmeId,
      branchId: c.batch.branchId,
      departmentId: c.batch.branch.departmentId,
      joinsCohortId: c.joinsCohortId,
    })),
    sections: sections.map((s) => ({
      id: s.id,
      cohortId: s.cohortId,
      name: s.name,
      displayName: s.displayName,
      strength: s.strength,
      homeRoomId: s.homeRoomId,
    })),
    subGroups: sections.flatMap((s) =>
      s.subGroups.map((g) => ({
        id: g.id,
        sectionId: g.sectionId,
        name: g.name,
        strength: g.strength,
      })),
    ),
    electiveSections: electives.map((e) => ({
      id: e.id,
      courseId: e.courseId,
      name: e.name,
      strength: e.strength,
      sourceSectionIds: e.sources.map((x) => x.sectionId),
    })),
    courses: courses.map((c) => {
      const needs: Partial<Record<Component, { type: RoomType; labCategory: string | null }>> = {};
      if (c.isScheduled) {
        if (c.lectures > 0) needs.lecture = roomNeedFor(c, 'lecture');
        if (c.tutorials > 0) needs.tutorial = roomNeedFor(c, 'tutorial');
        if (c.practicals > 0) needs.practical = roomNeedFor(c, 'practical');
      }
      return {
        id: c.id,
        code: c.code,
        title: c.title,
        shortName: c.shortName,
        schemeVersionId: c.schemeVersionId,
        semester: c.semester,
        branchIds: c.branches.map((b) => b.branchId),
        offeringDepartmentId: c.offeringDepartmentId,
        type: c.type,
        electiveGroup: c.electiveGroup,
        lectures: c.lectures,
        tutorials: c.tutorials,
        practicals: c.practicals,
        syllabusHours: c.syllabusHours,
        labBlockLength: c.labBlockLength,
        isScheduled: c.isScheduled,
        tutorialBy: c.tutorialBy,
        practicalBy: c.practicalBy,
        roomNeeds: needs,
      };
    }),
    assignments: assignments
      .filter((a) => courseById.has(a.courseId))
      .map((a) => ({
        id: a.id,
        courseId: a.courseId,
        component: a.component,
        target: a.target,
        sectionId: a.sectionId,
        subGroupId: a.subGroupId,
        electiveSectionId: a.electiveSectionId,
        preferredRoomId: a.preferredRoomId,
        preferredLabCategory: a.preferredLabCategory,
        periodsPerWeek: courseById.get(a.courseId)!.isScheduled
          ? periodsFor(a.courseId, a.component)
          : 0,
        faculty: a.faculty.map((f) => ({ facultyId: f.facultyId, role: f.role })),
      })),
    faculty: faculty.map((f) => ({
      id: f.id,
      name: f.name,
      shortCode: f.shortCode,
      homeDepartmentId: f.homeDepartmentId,
      designation: f.designation,
      experience: f.experience,
      maxPeriodsPerDay: f.maxPeriodsPerDay,
      maxPeriodsPerWeek: f.maxPeriodsPerWeek,
      unavailable: f.unavailability
        .map((u) => ({ weekday: u.weekday, periodIndex: u.periodIndex }))
        .sort((x, y) => x.weekday - y.weekday || x.periodIndex - y.periodIndex),
    })),
    rooms: rooms.map((r) => ({
      id: r.id,
      code: r.code,
      buildingId: r.buildingId,
      buildingName: r.building.name,
      floor: r.floor,
      type: r.type,
      labCategories: r.labCategories,
      capacity: classCapacity(r),
      rows: r.rows,
      seatsPerRow: r.seatsPerRow,
      examSeatsPerBench: r.examSeatsPerBench,
      ownerDepartmentId: r.ownerDepartmentId,
      isShared: r.isShared,
      isAccessible: r.isAccessible,
    })),
    fixedSlots: fixedSlots.map((s) => ({
      ...scope(s),
      id: s.id,
      kind: s.kind,
      label: s.label,
      weekday: s.weekday,
      startPeriodIndex: s.startPeriodIndex,
      endPeriodIndex: s.endPeriodIndex,
      facultyIds: s.faculty.map((f) => f.facultyId),
    })),
  });
}

/** Greedy placer: first free cell per session, spreading over days. Not the real solver. */
function greedySolve(snap: SetupSnapshotV1): SolverTimetableResponseV1 {
  const sectionById = new Map(snap.sections.map((s) => [s.id, s]));
  const subGroupById = new Map(snap.subGroups.map((g) => [g.id, g]));
  const electiveById = new Map(snap.electiveSections.map((e) => [e.id, e]));
  const cohortById = new Map(snap.cohorts.map((c) => [c.id, c]));
  const courseById = new Map(snap.courses.map((c) => [c.id, c]));
  const facultyById = new Map(snap.faculty.map((f) => [f.id, f]));
  const subGroupsOf = (sectionId: string) =>
    snap.subGroups.filter((g) => g.sectionId === sectionId);

  const busy = new Set<string>();
  const perDay = new Map<string, number>();
  const perWeek = new Map<string, number>();
  const cell = (token: string, day: number, p: number) => `${token}@${day}:${p}`;

  /** Tokens a class occupies: whole section = section + all its sub-groups. */
  const tokensFor = (
    a: SnapshotAssignmentV1,
  ): { tokens: string[]; sectionIds: string[]; strength: number } => {
    const whole = (sectionId: string) => [
      `sec:${sectionId}`,
      ...subGroupsOf(sectionId).map((g) => `sg:${g.id}`),
    ];
    if (a.target === 'section') {
      const s = sectionById.get(a.sectionId!)!;
      return { tokens: whole(s.id), sectionIds: [s.id], strength: s.strength };
    }
    if (a.target === 'subgroup') {
      const g = subGroupById.get(a.subGroupId!)!;
      return {
        tokens: [`sg:${g.id}`, `secpart:${g.sectionId}`],
        sectionIds: [g.sectionId],
        strength: g.strength,
      };
    }
    const e = electiveById.get(a.electiveSectionId!)!;
    return {
      tokens: [`el:${e.id}`, ...e.sourceSectionIds.flatMap(whole)],
      sectionIds: e.sourceSectionIds,
      strength: e.strength,
    };
  };

  const placed: PlacedSessionV1[] = [];
  const unplaced: UnplacedSessionV1[] = [];
  let dayOffset = 0;

  for (const a of snap.assignments) {
    const course = courseById.get(a.courseId)!;
    if (a.periodsPerWeek === 0) continue;
    const { tokens, sectionIds, strength } = tokensFor(a);
    // A whole-section class also clashes with any sub-group class of that section.
    const clashTokens = a.target === 'section' ? [...tokens, `secpart:${a.sectionId}`] : tokens;
    const cohort = cohortById.get(sectionById.get(sectionIds[0]!)!.cohortId)!;
    const bell = bellScheduleFor(cohort, snap.bellSchedules)!;
    const need = course.roomNeeds[a.component]!;
    const rooms = snap.rooms
      .filter((r) => roomFits(r, need) && r.capacity >= strength)
      .sort((x, y) => x.capacity - y.capacity);
    const facultyIds = a.faculty.map((f) => f.facultyId);
    const lengths = sessionLengths(a.periodsPerWeek, a.component, course.labBlockLength);
    const usedDays = new Set<number>();

    lengths.forEach((length, i) => {
      const sessionId = `${a.id}#${i + 1}`;
      const starts = blockStarts(bell, length);
      const days = bell.workingDays.map(
        (_, k) => bell.workingDays[(k + dayOffset) % bell.workingDays.length]!,
      );
      dayOffset++;
      let done = false;
      for (const day of [
        ...days.filter((d) => !usedDays.has(d)),
        ...days.filter((d) => usedDays.has(d)),
      ]) {
        for (const start of starts) {
          const ps = Array.from({ length }, (_, k) => start + k);
          if (ps.some((p) => clashTokens.some((t) => busy.has(cell(t, day, p))))) continue;
          if (ps.some((p) => facultyIds.some((f) => busy.has(cell(`f:${f}`, day, p))))) continue;
          const fixedHit = snap.fixedSlots.some(
            (fs) =>
              fs.weekday === day &&
              ps.some((p) => p >= fs.startPeriodIndex && p <= fs.endPeriodIndex) &&
              sectionIds.some((sid) =>
                scopeApplies(fs, {
                  departmentId: cohort.departmentId,
                  programmeId: cohort.programmeId,
                  cohortId: cohort.id,
                  sectionId: sid,
                }),
              ),
          );
          if (fixedHit) continue;
          const facultyOk = facultyIds.every((f) => {
            const fac = facultyById.get(f)!;
            if (fac.unavailable.some((u) => u.weekday === day && ps.includes(u.periodIndex)))
              return false;
            if ((perDay.get(`${f}@${day}`) ?? 0) + length > fac.maxPeriodsPerDay) return false;
            return (perWeek.get(f) ?? 0) + length <= fac.maxPeriodsPerWeek;
          });
          if (!facultyOk) continue;
          const room = rooms.find((r) => ps.every((p) => !busy.has(cell(`r:${r.id}`, day, p))));
          if (!room) continue;
          for (const p of ps) {
            for (const t of tokens) busy.add(cell(t, day, p));
            for (const f of facultyIds) busy.add(cell(`f:${f}`, day, p));
            busy.add(cell(`r:${room.id}`, day, p));
          }
          for (const f of facultyIds) {
            perDay.set(`${f}@${day}`, (perDay.get(`${f}@${day}`) ?? 0) + length);
            perWeek.set(f, (perWeek.get(f) ?? 0) + length);
          }
          usedDays.add(day);
          placed.push({
            sessionId,
            assignmentId: a.id,
            courseId: a.courseId,
            component: a.component,
            target: {
              kind: a.target,
              id: (a.sectionId ?? a.subGroupId ?? a.electiveSectionId)!,
            },
            facultyIds,
            locked: false,
            weekday: day,
            startPeriodIndex: start,
            length,
            roomId: room.id,
          });
          done = true;
          break;
        }
        if (done) break;
      }
      if (!done) {
        const noRoom = rooms.length === 0;
        unplaced.push({
          sessionId,
          assignmentId: a.id,
          reason: noRoom ? 'no_suitable_room' : 'no_free_slot',
          message: noRoom
            ? `No ${need.type}${need.labCategory ? ` (${need.labCategory})` : ''} room seats ${strength} for ${course.code} ${course.shortName}.`
            : `No period is free for ${course.code} ${course.shortName} (${a.component}) with its teacher, students and a room all available.`,
          involved: {
            facultyIds,
            roomIds: rooms.map((r) => r.id),
            sectionIds: a.target === 'section' ? sectionIds : [],
            subGroupIds: a.subGroupId ? [a.subGroupId] : [],
            electiveSectionIds: a.electiveSectionId ? [a.electiveSectionId] : [],
            courseIds: [a.courseId],
          },
        });
      }
    });
  }

  return SolverTimetableResponseV1.parse({
    version: 'solver-timetable.v1',
    requestId: 'fixture-demo-term',
    status: unplaced.length === 0 ? 'FEASIBLE' : 'INFEASIBLE',
    solveSeconds: 0.5,
    placed,
    unplaced,
    score: {
      total: 0,
      breakdown: [
        { constraint: 'theory_spread', weight: 10, count: 0, penalty: 0 },
        { constraint: 'faculty_consecutive', weight: 5, count: 0, penalty: 0 },
        { constraint: 'late_slots', weight: 2, count: 0, penalty: 0 },
        { constraint: 'section_idle_gaps', weight: 3, count: 0, penalty: 0 },
        { constraint: 'home_room', weight: 1, count: 0, penalty: 0 },
        { constraint: 'preferred_room', weight: 1, count: 0, penalty: 0 },
      ],
    },
  });
}

/** The published timetable for one section, as the read API returns it. */
function publishedFor(
  snap: SetupSnapshotV1,
  solution: SolverTimetableResponseV1,
  sectionId: string,
) {
  const versionId = uuidFrom('version:1');
  const courseById = new Map(snap.courses.map((c) => [c.id, c]));
  const facultyById = new Map(snap.faculty.map((f) => [f.id, f]));
  const roomById = new Map(snap.rooms.map((r) => [r.id, r]));
  const section = snap.sections.find((s) => s.id === sectionId)!;
  const subGroups = snap.subGroups.filter((g) => g.sectionId === sectionId);
  const cohort = snap.cohorts.find((c) => c.id === section.cohortId)!;
  const bell = bellScheduleFor(cohort, snap.bellSchedules)!;
  const period = (i: number) => bell.periods.find((p) => p.index === i)!;

  const names = new Map<string, string>([
    [section.id, section.displayName],
    ...subGroups.map((g): [string, string] => [g.id, `${section.displayName}-${g.name}`]),
    ...snap.electiveSections.map((e): [string, string] => [e.id, e.name]),
  ]);
  const mine = solution.placed.filter(
    (p) =>
      p.target.id === sectionId ||
      subGroups.some((g) => g.id === p.target.id) ||
      snap.electiveSections.some(
        (e) => e.id === p.target.id && e.sourceSectionIds.includes(sectionId),
      ),
  );
  const slots: TimetableSlotV1[] = mine
    .sort((x, y) => x.weekday - y.weekday || x.startPeriodIndex - y.startPeriodIndex)
    .map((p) => {
      const course = courseById.get(p.courseId)!;
      const elective = snap.electiveSections.find((e) => e.id === p.target.id);
      return {
        id: uuidFrom(`slot:${p.sessionId}`),
        versionId,
        weekday: p.weekday,
        startPeriodIndex: p.startPeriodIndex,
        length: p.length,
        startMinute: period(p.startPeriodIndex).startMinute,
        endMinute: period(p.startPeriodIndex + p.length - 1).endMinute,
        assignmentId: p.assignmentId,
        component: p.component,
        course: {
          id: course.id,
          code: course.code,
          shortName: course.shortName,
          title: course.title,
        },
        target: { kind: p.target.kind, id: p.target.id, name: names.get(p.target.id) ?? '' },
        sectionIds: elective ? elective.sourceSectionIds : [sectionId],
        faculty: p.facultyIds.map((id) => {
          const f = facultyById.get(id)!;
          return { id, name: f.name, shortCode: f.shortCode };
        }),
        room: { id: p.roomId, code: roomById.get(p.roomId)!.code },
      };
    });
  return TimetableReadResponseV1.parse({
    contract: 'timetable-read.v1',
    version: {
      id: versionId,
      termId: snap.term.id,
      scopeId: null,
      number: 1,
      status: 'published',
      publishedAt: '2026-07-20T10:00:00.000Z',
      publishedById: null,
      validFrom: snap.term.startDate,
      validTo: null,
    },
    slots,
  });
}

/** A Monday that is a teaching day (no holiday), from the term start. */
function teachingMonday(snap: SetupSnapshotV1): string {
  const d = new Date(`${snap.term.startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 14);
  while (true) {
    const day = iso(d);
    const holiday = snap.holidays.some((h) => h.startDate <= day && h.endDate >= day);
    if (d.getUTCDay() === 1 && !holiday) return day;
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function studentToday(snap: SetupSnapshotV1, published: TimetableReadResponseV1) {
  const section = snap.sections.find((s) => s.id === published.slots[0]!.sectionIds[0])!;
  const subGroup = snap.subGroups.find((g) => g.sectionId === section.id);
  const monday = published.slots.filter(
    (s) => s.weekday === 1 && (s.target.kind !== 'subgroup' || s.target.id === subGroup?.id),
  );
  const classes = monday.map((s, i) => ({
    id: s.id,
    kind: 'regular' as const,
    cancelled: i === 1,
    cancelReason: i === 1 ? 'Department seminar' : null,
    startPeriodIndex: s.startPeriodIndex,
    length: s.length,
    startMinute: s.startMinute,
    endMinute: s.endMinute,
    component: s.component,
    courseCode: s.course.code,
    courseShortName: s.course.shortName,
    courseTitle: s.course.title,
    roomCode: s.room?.code ?? null,
    withWhom: s.faculty.map((f) => f.name).join(', '),
  }));
  const hhmm = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const cancelled = classes.find((c) => c.cancelled);
  return TodayV1.parse({
    contract: 'portal-read.v1',
    date: teachingMonday(snap),
    timezone: snap.timezone,
    viewer: {
      role: 'student',
      id: uuidFrom(`student:${section.id}:1`),
      name: 'Asha Verma',
      groupLabel: section.displayName,
    },
    holiday: null,
    nextClassId: classes.find((c) => !c.cancelled)?.id ?? null,
    classes,
    changes: cancelled
      ? [
          {
            kind: 'cancelled',
            message: `${cancelled.courseCode} ${cancelled.courseShortName} at ${hhmm(cancelled.startMinute)} is cancelled: Department seminar`,
            classId: cancelled.id,
          },
        ]
      : [],
    examSeat: null,
  });
}

/** One exam session: two papers of semester-3 cohorts, interleaved in a checkerboard. */
function seating(snap: SetupSnapshotV1) {
  const sem3 = snap.cohorts
    .filter((c) => c.semester === 3 && c.isRunning && !c.joinsCohortId)
    .slice(0, 2);
  const papers = sem3.map((c) => {
    const course = snap.courses.find(
      (x) =>
        x.schemeVersionId === c.schemeVersionId &&
        x.semester === 3 &&
        x.lectures > 0 &&
        (x.branchIds.length === 0 || x.branchIds.includes(c.branchId)),
    )!;
    return {
      cohort: c,
      paper: { id: uuidFrom(`paper:${course.id}:${c.id}`), code: course.code, title: course.title },
    };
  });
  let roll = 0;
  const students = papers.flatMap(({ cohort, paper }) =>
    snap.sections
      .filter((s) => s.cohortId === cohort.id)
      .flatMap((s) =>
        Array.from({ length: Math.min(s.strength, 30) }, (_, i) => {
          roll++;
          return {
            id: uuidFrom(`student:${s.id}:${i + 1}`),
            rollNo: `26${String(1000 + roll)}`,
            paperId: paper.id,
            sectionId: s.id,
            needsAccessibleSeat: roll === 7,
          };
        }),
      ),
  );
  const halls = snap.rooms
    .filter((r) => r.type === 'lecture' && r.rows && r.seatsPerRow)
    .slice(0, 3)
    .map((r, i) => ({
      id: r.id,
      code: r.code,
      floor: r.floor,
      isAccessible: r.isAccessible,
      rows: r.rows!,
      benchesPerRow: Math.max(1, Math.floor(r.seatsPerRow! / 2)),
      seatsPerBench: 2,
      order: i,
    }));
  const teaches = new Set(papers.map((p) => p.paper.code));
  const faculty = snap.faculty.slice(0, 8).map((f, i) => ({
    id: f.id,
    name: f.name,
    available: i !== 3,
    teachesPaperIds: snap.assignments.some(
      (a) =>
        a.faculty.some((x) => x.facultyId === f.id) &&
        teaches.has(snap.courses.find((c) => c.id === a.courseId)!.code),
    )
      ? papers.map((p) => p.paper.id)
      : [],
    dutiesSoFar: i % 3,
  }));
  const request = SolverSeatingRequestV1.parse({
    version: 'solver-seating.v1',
    requestId: 'fixture-demo-exam',
    examSessionId: uuidFrom('exam-session:mid-sem-1:morning'),
    date: '2026-09-21',
    sessionLabel: 'Morning',
    papers: papers.map((p) => p.paper),
    students,
    halls,
    faculty,
    options: { reserveSeatsPerHall: 2 },
  });

  // Checkerboard: paper = (row + column) % 2, so the same paper is never left/right or
  // front/back of itself. Accessible students take the front row of the first hall.
  const byPaper = request.papers.map((p) =>
    request.students
      .filter((s) => s.paperId === p.id)
      .sort((a, b) => a.rollNo.localeCompare(b.rollNo)),
  );
  const seats: SolverSeatingResponseV1['seats'] = [];
  const hallsOut: SolverSeatingResponseV1['halls'] = [];
  const freeFaculty = request.faculty
    .filter((f) => f.available && f.teachesPaperIds.length === 0)
    .sort((a, b) => a.dutiesSoFar - b.dutiesSoFar);
  for (const hall of request.halls) {
    const columns = hall.benchesPerRow * hall.seatsPerBench;
    const capacity = hall.rows * columns;
    const usable = capacity - request.options.reserveSeatsPerHall;
    let used = 0;
    const paperIds = new Set<string>();
    for (let row = 1; row <= hall.rows && used < usable; row++) {
      for (let column = 1; column <= columns && used < usable; column++) {
        const queue = byPaper[(row + column) % byPaper.length]!;
        const student = queue.shift();
        if (!student) continue;
        seats.push({
          studentId: student.id,
          paperId: student.paperId,
          hallId: hall.id,
          row,
          column,
          label: `${hall.code}-R${row}-C${column}`,
        });
        paperIds.add(student.paperId);
        used++;
      }
    }
    const invigilators = used > 0 ? freeFaculty.splice(0, Math.max(1, Math.ceil(used / 30))) : [];
    hallsOut.push({
      hallId: hall.id,
      capacity,
      used,
      reserved: request.options.reserveSeatsPerHall,
      paperIds: [...paperIds],
      invigilatorIds: invigilators.map((f) => f.id),
    });
  }
  const unseated = byPaper.flat().map((s) => ({
    studentId: s.id,
    reason: 'not_enough_seats' as const,
    message: `No seat left for roll no. ${s.rollNo}; add a hall or reduce the reserve.`,
  }));
  const response = SolverSeatingResponseV1.parse({
    version: 'solver-seating.v1',
    requestId: request.requestId,
    status: unseated.length === 0 ? 'FEASIBLE' : 'INFEASIBLE',
    solveSeconds: 0.2,
    seats,
    unseated,
    halls: hallsOut,
    invigilationProblems: [],
  });
  return { request, response };
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const snapshot = await buildSnapshot();
  const solution = greedySolve(snapshot);
  // The section with the fullest week, so consumers see a realistic timetable.
  const published = snapshot.sections
    .map((s) => publishedFor(snapshot, solution, s.id))
    .reduce((best, t) => (t.slots.length > best.slots.length ? t : best));
  const exam = seating(snapshot);
  write('demo-term.snapshot.json', snapshot);
  write('demo-term.solution.json', solution);
  write('demo-term.published-timetable.json', published);
  write('demo-exam.seating-request.json', exam.request);
  write('demo-exam.seating-response.json', exam.response);
  write('demo-student.today.json', studentToday(snapshot, published));
  console.log(
    `  ${solution.placed.length} sessions placed, ${solution.unplaced.length} unplaced; ` +
      `${exam.response.seats.length} exam seats`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
