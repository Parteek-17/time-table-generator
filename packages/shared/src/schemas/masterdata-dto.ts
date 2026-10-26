/**
 * Response shapes of the Phase 1 master-data API (API → web). Dates are "YYYY-MM-DD",
 * timestamps ISO strings. `archivedAt` is the row's deleted_at (the UI says "Archived").
 */
import type { CellProblem, ImportKindName } from '../domain/imports';
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
  SetupStep,
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

export interface SetupStepDto {
  id: SetupStep;
  /** What the admin said: done, skipped for now, or not yet. */
  status: 'done' | 'skipped' | 'todo';
  /** Whether there is already data for this step (e.g. 5 departments). */
  hasData: boolean;
  /** How many rows the step has (departments, rooms …). */
  count: number;
  /** False for steps that arrive in a later milestone (teaching grid, readiness). */
  available: boolean;
}

/** Something that needs the admin's attention, with the screen that fixes it. */
export interface SetupAttentionDto {
  code:
    | 'no_departments'
    | 'no_programmes'
    | 'no_active_term'
    | 'no_cohorts'
    | 'cohorts_without_sections'
    | 'no_faculty'
    | 'no_rooms'
    | 'no_bell_schedule';
  count: number;
  href: string;
}

export interface SetupStateDto {
  steps: SetupStepDto[];
  /** First step not done or skipped (null when everything is). */
  nextStep: SetupStep | null;
  /** Share of available steps done or skipped, 0..100. */
  percent: number;
  attention: SetupAttentionDto[];
  activeTermId: string | null;
}

export interface SampleInstituteDto {
  slug: string;
  /** Where to open it; the sample data loads in the background (a few seconds). */
  url: string;
}

// ---- Excel/CSV import (ADR 0011) -----------------------------------------------------------

export type ImportStatusName =
  | 'uploaded'
  | 'parsing'
  | 'mapping'
  | 'preview'
  | 'committing'
  | 'committed'
  | 'failed'
  | 'cancelled';

/** What committing a row will do, decided by its natural key (or the admin's skip). */
export type ImportRowAction = 'create' | 'update' | 'unchanged' | 'skip';

export interface ImportSummaryDto {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  /** Plain-language reason when reading or committing failed. */
  error?: string;
}

export interface ImportJobDto {
  id: string;
  kind: ImportKindName;
  status: ImportStatusName;
  fileName: string;
  termId: string | null;
  rowCount: number;
  /** 0..100 while reading or committing in the background. */
  progress: number;
  /** Header row of the file, for matching columns by hand. */
  headers: string[];
  /** Template column → header index; missing = not in the file. */
  mapping: Record<string, number>;
  /** Required template columns without a header. */
  missingRequired: string[];
  /** Row counts for the preview (before commit) or the result (after). */
  counts: { problems: number } & Record<ImportRowAction, number>;
  summary: ImportSummaryDto;
  createdAt: string;
  createdByName: string | null;
}

export interface ImportRowDto {
  rowNumber: number;
  data: Record<string, string>;
  errors: CellProblem[];
  action: ImportRowAction;
}

export interface ImportRowsPageDto {
  rows: ImportRowDto[];
  page: number;
  pageCount: number;
  total: number;
}

/** A template file, base64-encoded so it travels in JSON. */
export interface ImportTemplateFileDto {
  fileName: string;
  contentBase64: string;
}
