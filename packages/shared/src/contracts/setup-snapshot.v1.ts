/**
 * Setup snapshot v1: everything the timetable solver needs for one term, in one JSON document.
 *
 * Producer: P1 — `GET /terms/:termId/snapshot` (API, permission `masterdata.view`), built like
 * `packages/db/src/readiness-snapshot.ts` (same rows, plus the fields the solver needs).
 * Consumers: P2T (sends it to the solver inside SolverTimetableRequestV1), P2E (solver input).
 * Fixture: `@slotwise/shared/fixtures` → `demoTermSnapshot()`.
 *
 * Rules: archived rows (deleted_at) are left out; ids are database uuids; times are minutes
 * from midnight; weekdays are ISO (1 = Monday); dates are `YYYY-MM-DD`.
 */
import { z } from 'zod';
import {
  CellV1,
  ComponentV1,
  Count,
  Id,
  IsoDate,
  IsoDateTime,
  Minute,
  PeriodIndex,
  RoomTypeV1,
  ScopeV1,
  TargetKindV1,
  Weekday,
} from './common.v1';

export const SETUP_SNAPSHOT_V1 = 'setup-snapshot.v1' as const;

export const SnapshotTermV1 = z.object({
  /** Term id. */
  id: Id,
  /** e.g. "July–Dec 2026". */
  label: z.string(),
  /** odd (Jul–Dec) or even (Jan–Jun) semester term. */
  kind: z.enum(['odd', 'even']),
  /** planning, active or closed. Only one term per institute is active. */
  status: z.enum(['planning', 'active', 'closed']),
  /** First day of the term. */
  startDate: IsoDate,
  /** Last day of the term (inclusive). */
  endDate: IsoDate,
  /** Minimum teaching days a cohort must get (default 90). */
  minTeachingDays: Count,
});

export const SnapshotBellPeriodV1 = z.object({
  /** 1-based period number, consecutive within a schedule. */
  index: PeriodIndex,
  /** Label shown in timetables, e.g. "P3". */
  label: z.string(),
  /** Start, minutes from midnight. */
  startMinute: Minute,
  /** End, minutes from midnight (> startMinute). */
  endMinute: Minute,
});

export const SnapshotBellBreakV1 = z.object({
  /** e.g. "Lunch". */
  label: z.string(),
  /** The break follows this period. */
  afterPeriodIndex: PeriodIndex,
  /** Length. Breaks of 30 minutes or more split lab blocks (CLAUDE.md). */
  minutes: Count,
});

export const SnapshotBellScheduleV1 = z.object({
  /** Bell schedule id. */
  id: Id,
  /** e.g. "Regular", "First year". */
  name: z.string(),
  /** The schedule every cohort follows unless an override matches. Exactly one is default. */
  isDefault: z.boolean(),
  /** Teaching weekdays, ISO numbers, ascending. */
  workingDays: z.array(Weekday),
  /** Periods in order. */
  periods: z.array(SnapshotBellPeriodV1),
  /** Breaks between periods. */
  breaks: z.array(SnapshotBellBreakV1),
  /**
   * Programmes (optionally only some semesters; empty = all) that follow this schedule
   * instead of the default. Resolve with bellScheduleFor() in @slotwise/shared.
   */
  overrides: z.array(
    z.object({
      /** Programme id. */
      programmeId: Id,
      /** Semesters it applies to; empty = every semester. */
      semesters: z.array(z.int().min(1)),
    }),
  ),
});

export const SnapshotHolidayV1 = ScopeV1.extend({
  /** Holiday id. */
  id: Id,
  /** e.g. "Diwali". */
  name: z.string(),
  /** First day off. */
  startDate: IsoDate,
  /** Last day off (inclusive). */
  endDate: IsoDate,
});

export const SnapshotCalendarWindowV1 = ScopeV1.extend({
  /** Window id. */
  id: Id,
  /** Non-teaching window kind. */
  type: z.enum(['mid_sem_exam', 'orientation', 'vacation', 'training', 'other']),
  /** e.g. "Mid-semester exams I". */
  label: z.string(),
  /** First day. */
  startDate: IsoDate,
  /** Last day (inclusive). */
  endDate: IsoDate,
});

export const SnapshotExtraWorkingDayV1 = ScopeV1.extend({
  /** Extra working day id. */
  id: Id,
  /** The (usually Saturday) date that becomes a teaching day. */
  date: IsoDate,
  /** It runs the timetable of this weekday (1 = Monday). */
  followsWeekday: Weekday,
});

export const SnapshotCohortWindowV1 = z.object({
  /** Window id. */
  id: Id,
  /** Programme it applies to. */
  programmeId: Id,
  /** Semesters it applies to; empty = all. */
  semesters: z.array(z.int().min(1)),
  /** Only regular or only lateral-entry cohorts; null = both. */
  entryType: z.enum(['regular', 'lateral']).nullable(),
  /** First teaching day for these cohorts. */
  teachingStart: IsoDate,
  /** Preparation holidays start (teaching ends the day before), if known. */
  prepHolidaysStart: IsoDate.nullable(),
  /** End-semester exams start, if known. */
  endSemExamStart: IsoDate.nullable(),
});

export const SnapshotCohortV1 = z.object({
  /** Cohort id: one batch in this term (e.g. 2024 CSE in semester 5). */
  id: Id,
  /** e.g. "D2 CSE". */
  displayCode: z.string(),
  /** Semester number this term. */
  semester: z.int().min(1),
  /** False during industrial training or internship: nothing to schedule. */
  isRunning: z.boolean(),
  /** regular or lateral (joined in a later semester). */
  entryType: z.enum(['regular', 'lateral']),
  /** Scheme version whose courses it takes. */
  schemeVersionId: Id,
  /** Programme id. */
  programmeId: Id,
  /** Branch id (programmes without branches have one "GEN" branch). */
  branchId: Id,
  /** Department that owns the branch. */
  departmentId: Id,
  /** Lateral-entry cohort sitting in another cohort's sections (no sections of its own). */
  joinsCohortId: Id.nullable(),
});

export const SnapshotSectionV1 = z.object({
  /** Section id. */
  id: Id,
  /** Cohort it belongs to. */
  cohortId: Id,
  /** e.g. "A". */
  name: z.string(),
  /** e.g. "CS A" — what timetables show. */
  displayName: z.string(),
  /** Students in the section. */
  strength: Count,
  /** Preferred home room (soft constraint: keep a section in one room), if set. */
  homeRoomId: Id.nullable(),
});

export const SnapshotSubGroupV1 = z.object({
  /** Sub-group id (lab batch, e.g. 5A-G1). */
  id: Id,
  /** Section it is part of. */
  sectionId: Id,
  /** e.g. "G1". */
  name: z.string(),
  /** Students in the sub-group. */
  strength: Count,
});

export const SnapshotElectiveSectionV1 = z.object({
  /** Elective section id. */
  id: Id,
  /** The elective course it is for. */
  courseId: Id,
  /** e.g. "ML-1". */
  name: z.string(),
  /** Students in it. */
  strength: Count,
  /** Regular sections its students come from; they are busy while it meets. */
  sourceSectionIds: z.array(Id),
});

export const RoomNeedV1 = z.object({
  /** Room type required. */
  type: RoomTypeV1,
  /** Lab category the room must offer (e.g. "Software lab"), if any. */
  labCategory: z.string().nullable(),
});

export const SnapshotCourseV1 = z.object({
  /** Course id. */
  id: Id,
  /** e.g. "CS301". */
  code: z.string(),
  /** Full title. */
  title: z.string(),
  /** Short name used in timetable cells, e.g. "DS". */
  shortName: z.string(),
  /** Scheme version it belongs to. */
  schemeVersionId: Id,
  /** Semester it is taught in. */
  semester: z.int().min(1),
  /** Branches that take it; empty = every branch of the programme. */
  branchIds: z.array(Id),
  /** Department that teaches it. */
  offeringDepartmentId: Id,
  /** core, programme_elective, open_elective, mandatory, audit, lab, project, … */
  type: z.string(),
  /** Courses with the same group run in parallel (e.g. "Elective-IV"); null otherwise. */
  electiveGroup: z.string().nullable(),
  /** L: lecture periods per week. */
  lectures: Count,
  /** T: tutorial periods per week. */
  tutorials: Count,
  /** P: practical periods per week. */
  practicals: Count,
  /** Contact hours to deliver in the term, if the scheme says. */
  syllabusHours: Count.nullable(),
  /** Consecutive periods per practical session (usually 2 or 3). */
  labBlockLength: z.int().min(1),
  /** False for MOOCs, training, project-only courses: never scheduled. */
  isScheduled: z.boolean(),
  /** Tutorials are held per section or per sub-group. */
  tutorialBy: z.enum(['section', 'subgroup']),
  /** Practicals are held per section or per sub-group. */
  practicalBy: z.enum(['section', 'subgroup']),
  /** Room each component needs (roomNeedFor() in @slotwise/shared); absent = no periods. */
  roomNeeds: z.object({
    /** Room for lectures. */
    lecture: RoomNeedV1.optional(),
    /** Room for tutorials. */
    tutorial: RoomNeedV1.optional(),
    /** Room for practicals. */
    practical: RoomNeedV1.optional(),
  }),
});

export const SnapshotAssignmentV1 = z.object({
  /** Teaching assignment id: who teaches one component of a course to one group. */
  id: Id,
  /** Course id. */
  courseId: Id,
  /** lecture, tutorial or practical. */
  component: ComponentV1,
  /** Audience kind; exactly one of the three ids below is set to match. */
  target: TargetKindV1,
  /** Set when target is section. */
  sectionId: Id.nullable(),
  /** Set when target is subgroup. */
  subGroupId: Id.nullable(),
  /** Set when target is elective_section. */
  electiveSectionId: Id.nullable(),
  /** Room the coordinator prefers (soft), if any. */
  preferredRoomId: Id.nullable(),
  /** Lab category the coordinator prefers (soft), if any. */
  preferredLabCategory: z.string().nullable(),
  /** Periods per week this assignment needs (L, T or P of the course for this component). */
  periodsPerWeek: Count,
  /** Teachers. All of them are busy during every session of this assignment. */
  faculty: z.array(
    z.object({
      /** Faculty id. */
      facultyId: Id,
      /** main teacher, co_teacher or ta. */
      role: z.enum(['main', 'co_teacher', 'ta']),
    }),
  ),
});

export const SnapshotFacultyV1 = z.object({
  /** Faculty id. */
  id: Id,
  /** Display name (fictional in fixtures). */
  name: z.string(),
  /** Short code shown in timetables, e.g. "VT". */
  shortCode: z.string(),
  /** Home department. */
  homeDepartmentId: Id,
  /** professor, associate_professor, assistant_professor, lecturer, teaching_assistant, visiting. */
  designation: z.string(),
  /** experienced or fresher (sets default load limits). */
  experience: z.enum(['experienced', 'fresher']),
  /** Hard limit: teaching periods per day. */
  maxPeriodsPerDay: Count,
  /** Hard limit: teaching periods per week. */
  maxPeriodsPerWeek: Count,
  /** Cells they cannot teach (hard constraint). */
  unavailable: z.array(CellV1),
});

export const SnapshotRoomV1 = z.object({
  /** Room id. */
  id: Id,
  /** e.g. "G16", "SL-IV LAB". */
  code: z.string(),
  /** Building id. */
  buildingId: Id,
  /** Building name, for display. */
  buildingName: z.string(),
  /** 0 = ground floor. */
  floor: z.int(),
  /** Room type; must match the class's room need. */
  type: RoomTypeV1,
  /** Lab categories it offers, e.g. ["Software lab"]. */
  labCategories: z.array(z.string()),
  /** Teaching capacity: capacityOverride, else rows × seatsPerRow (classCapacity()). */
  capacity: Count,
  /** Bench rows, if known. */
  rows: Count.nullable(),
  /** Seats per row, if known. */
  seatsPerRow: Count.nullable(),
  /** Exam seats per bench (exam capacity is separate from teaching capacity). */
  examSeatsPerBench: Count.nullable(),
  /** Department that owns it, if any. */
  ownerDepartmentId: Id.nullable(),
  /** Any department may use it. */
  isShared: z.boolean(),
  /** Ground floor or reachable by lift. */
  isAccessible: z.boolean(),
});

export const SnapshotFixedSlotV1 = ScopeV1.extend({
  /** Fixed slot id: a block the timetable must keep free (mentoring, library, NCC …). */
  id: Id,
  /** mentoring, minor_degree, honours, remedial, library, sports_ncc, other. */
  kind: z.string(),
  /** Shown in the timetable cell. */
  label: z.string(),
  /** ISO weekday. */
  weekday: Weekday,
  /** First period blocked. */
  startPeriodIndex: PeriodIndex,
  /** Last period blocked (inclusive). */
  endPeriodIndex: PeriodIndex,
  /** Faculty who are busy in it (e.g. mentors); empty = none. */
  facultyIds: z.array(Id),
});

export const SetupSnapshotV1 = z.object({
  /** Always "setup-snapshot.v1". */
  version: z.literal(SETUP_SNAPSHOT_V1),
  /** When the API built it. */
  generatedAt: IsoDateTime,
  /** Institute id. */
  instituteId: Id,
  /** IANA time zone of the institute, e.g. "Asia/Kolkata". */
  timezone: z.string(),
  /** The term being timetabled. */
  term: SnapshotTermV1,
  /**
   * Limited to the cohorts of one timetable scope, if the caller asked for one
   * (`?scopeId=`); null = every running cohort of the term.
   */
  scope: z
    .object({
      /** Timetable scope id. */
      id: Id,
      /** e.g. "Main". */
      name: z.string(),
      /** Cohorts in the scope. */
      cohortIds: z.array(Id),
    })
    .nullable(),
  /** All bell schedules (cohorts pick theirs via isDefault / overrides). */
  bellSchedules: z.array(SnapshotBellScheduleV1),
  /** Holidays overlapping the term. */
  holidays: z.array(SnapshotHolidayV1),
  /** Non-teaching windows in the term (mid-sem exams, orientation, vacation, training). */
  calendarWindows: z.array(SnapshotCalendarWindowV1),
  /** Saturdays (or other days) that become teaching days. */
  extraWorkingDays: z.array(SnapshotExtraWorkingDayV1),
  /** Per-programme teaching start and exam dates. */
  cohortWindows: z.array(SnapshotCohortWindowV1),
  /** Cohorts in this term (or scope). */
  cohorts: z.array(SnapshotCohortV1),
  /** Sections of those cohorts. */
  sections: z.array(SnapshotSectionV1),
  /** Sub-groups of those sections. */
  subGroups: z.array(SnapshotSubGroupV1),
  /** Elective sections of this term. */
  electiveSections: z.array(SnapshotElectiveSectionV1),
  /** Courses those cohorts take (their scheme version and semester). */
  courses: z.array(SnapshotCourseV1),
  /** Teaching assignments of this term. Each needs `periodsPerWeek` sessions-worth of periods. */
  assignments: z.array(SnapshotAssignmentV1),
  /** Faculty of the institute (not only those with assignments: fixed slots may name others). */
  faculty: z.array(SnapshotFacultyV1),
  /** Rooms of the institute. */
  rooms: z.array(SnapshotRoomV1),
  /** Blocks that must stay free for their scope. */
  fixedSlots: z.array(SnapshotFixedSlotV1),
});

export type SetupSnapshotV1 = z.infer<typeof SetupSnapshotV1>;
export type SnapshotAssignmentV1 = z.infer<typeof SnapshotAssignmentV1>;
export type SnapshotBellScheduleV1 = z.infer<typeof SnapshotBellScheduleV1>;
export type SnapshotCourseV1 = z.infer<typeof SnapshotCourseV1>;
export type SnapshotFacultyV1 = z.infer<typeof SnapshotFacultyV1>;
export type SnapshotRoomV1 = z.infer<typeof SnapshotRoomV1>;
export type SnapshotSectionV1 = z.infer<typeof SnapshotSectionV1>;

/** API route that returns a SetupSnapshotV1 (relative to API_URL). */
export const SETUP_SNAPSHOT_V1_ROUTE = '/terms/:termId/snapshot' as const;
