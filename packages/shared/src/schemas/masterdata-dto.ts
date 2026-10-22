/**
 * Response shapes of the Phase 1 master-data API (API → web). Dates are "YYYY-MM-DD",
 * timestamps ISO strings. `archivedAt` is the row's deleted_at (the UI says "Archived").
 */
import type { PromoteRow } from '../domain/promote';
import type {
  AcademicSessionInput,
  BatchInput,
  BellScheduleInput,
  BranchInput,
  BuildingInput,
  CalendarWindowInput,
  CourseInput,
  DepartmentInput,
  ElectiveSectionInput,
  ExtraWorkingDayInput,
  FacultyInput,
  HolidayInput,
  InstituteProfileInput,
  ProgrammeInput,
  RoomInput,
  SchemeVersionInput,
  StudentInput,
  TermCohortWindowInput,
  TermInput,
} from './masterdata';

export interface RowMeta {
  id: string;
  archivedAt: string | null;
}

export interface InstituteProfileDto extends InstituteProfileInput {
  id: string;
  slug: string;
}

export interface DepartmentRow extends DepartmentInput, RowMeta {}

export interface BranchRow extends BranchInput, RowMeta {
  isDefault: boolean;
  departmentCode: string;
}

export interface ProgrammeRow extends Omit<ProgrammeInput, 'hasBranches'>, RowMeta {
  departmentCode: string | null;
  branches: BranchRow[];
}

export interface SchemeVersionRow extends SchemeVersionInput, RowMeta {
  programmeCode: string;
  courseCount: number;
}

export interface CourseRow extends CourseInput, RowMeta {
  credits: number;
  offeringDepartmentCode: string;
}

export interface AcademicSessionRow extends Omit<AcademicSessionInput, 'name'>, RowMeta {
  name: string;
}

export interface TermRow extends TermInput, RowMeta {
  sessionName: string;
  sessionStartYear: number;
}

export interface TermCohortWindowRow extends TermCohortWindowInput, RowMeta {
  programmeCode: string;
}

export interface CalendarWindowRow extends CalendarWindowInput, RowMeta {}
export interface HolidayRow extends HolidayInput, RowMeta {}
export interface ExtraWorkingDayRow extends ExtraWorkingDayInput, RowMeta {}

export interface BellScheduleRow extends BellScheduleInput, RowMeta {}

export interface BatchRow extends BatchInput, RowMeta {
  programmeCode: string;
  branchCode: string;
  schemeVersionName: string;
}

export interface CohortRow extends RowMeta {
  termId: string;
  batchId: string;
  semester: number;
  semesterOverridden: boolean;
  isRunning: boolean;
  displayCode: string;
  joinsCohortId: string | null;
  programmeId: string;
  programmeCode: string;
  branchId: string;
  branchCode: string;
  departmentId: string;
  admissionYear: number;
  entryType: 'regular' | 'lateral';
  schemeVersionId: string;
  sectionCount: number;
  strength: number;
}

export interface SubGroupRow {
  id: string;
  name: string;
  strength: number;
}

export interface SectionRow extends RowMeta {
  cohortId: string;
  name: string;
  displayName: string;
  strength: number;
  homeRoomId: string | null;
  subGroups: SubGroupRow[];
}

export interface ElectiveSectionRow extends ElectiveSectionInput, RowMeta {
  courseCode: string;
  courseTitle: string;
}

export interface StudentRow extends StudentInput, RowMeta {}

export interface FacultyRow extends FacultyInput, RowMeta {
  homeDepartmentCode: string;
  /** Linked login, if invited. */
  userId: string | null;
  unavailableCount: number;
}

export interface AvailabilityDto {
  facultyId: string;
  name: string;
  shortCode: string;
  /** From the default bell schedule. */
  workingDays: number[];
  periods: { index: number; label: string; startMinute: number; endMinute: number }[];
  unavailable: { weekday: number; periodIndex: number }[];
}

export interface BuildingRow extends BuildingInput, RowMeta {
  roomCount: number;
}

export interface RoomRow extends RoomInput, RowMeta {
  buildingName: string;
  classCapacity: number;
}

export interface AuditRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  actor: { id: string; name: string | null; email: string } | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PromotePreviewDto {
  fromTermId: string;
  toTermId: string;
  rows: PromoteRow[];
}

export interface PromoteResultDto {
  created: number;
  graduated: number;
  skipped: number;
}

export interface GenerateCohortsResultDto {
  created: number;
  existing: number;
  notRunning: number;
}

export interface HolidayPasteResultDto {
  created: number;
  errors: { line: number; text: string; message: string }[];
}
