import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { TxClient } from '@slotwise/db';
import { can } from '@slotwise/shared';
import type { TimetableReadQueryV1 } from '@slotwise/shared/contracts';
import {
  isoDate,
  type CalendarPlace,
  type PortalCalendar,
  type PortalViewer,
} from '@slotwise/shared/portal';
import type { Tenant } from '../common/request-context';

/** The signed-in student or teacher, with what is needed to read their week. */
export interface ResolvedViewer {
  viewer: PortalViewer;
  /** Term whose published timetable applies; null when there is none for the date. */
  termId: string | null;
  /** timetable-read.v1 query for their week. */
  query: Omit<TimetableReadQueryV1, 'versionId'>;
  /** Students: their programme and semester, for a programme's own bell schedule. */
  programme: { id: string; semester: number } | null;
}

export const NOT_LINKED =
  'Your sign-in isn’t linked to a student or teacher record at this institute yet. Ask your institute admin to add your email to your record.';
const NOT_ALLOWED = 'You don’t have permission to see this timetable. Ask your institute admin.';

/**
 * Finds who is looking (a teacher by their linked login, a student by their email) and loads
 * the academic calendar around a date. Reads P1's master data within the tenant's row-level
 * security; never P2T's tables (the week comes from timetable-read.v1).
 */
@Injectable()
export class PortalViewerService {
  async resolve(tx: TxClient, tenant: Tenant, date: string): Promise<ResolvedViewer> {
    const resolved = (await this.teacher(tx, tenant, date)) ?? (await this.student(tx, tenant));
    if (!resolved) throw new NotFoundException(NOT_LINKED);
    const place = resolved.viewer.place;
    // Their own week: the section for students, their own record for teachers.
    const allowed = can(tenant.authUser, 'timetable.view', {
      type: 'timetable',
      instituteId: tenant.institute.id,
      departmentId: place.departmentId,
      sectionId: place.sectionId,
    });
    if (!allowed) throw new ForbiddenException(NOT_ALLOWED);
    return resolved;
  }

  private async teacher(
    tx: TxClient,
    tenant: Tenant,
    date: string,
  ): Promise<ResolvedViewer | null> {
    const faculty = await tx.faculty.findFirst({
      where: { userId: tenant.user.id, deletedAt: null },
      select: { id: true, name: true, shortCode: true, homeDepartmentId: true },
    });
    if (!faculty) return null;
    return {
      viewer: {
        kind: 'faculty',
        id: faculty.id,
        name: faculty.name,
        groupLabel: faculty.shortCode,
        place: {
          sectionId: null,
          cohortId: null,
          programmeId: null,
          departmentId: faculty.homeDepartmentId,
        },
        electiveSectionIds: [],
      },
      termId: await this.termOn(tx, date),
      query: { facultyId: faculty.id },
      programme: null,
    };
  }

  private async student(tx: TxClient, tenant: Tenant): Promise<ResolvedViewer | null> {
    const student = await tx.student.findFirst({
      where: {
        email: { equals: tenant.user.email, mode: 'insensitive' },
        status: 'active',
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        sectionId: true,
        subGroupId: true,
        electives: { select: { electiveSectionId: true } },
        section: {
          select: {
            displayName: true,
            cohortId: true,
            cohort: {
              select: {
                termId: true,
                semester: true,
                batch: {
                  select: { programmeId: true, branch: { select: { departmentId: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!student) return null;
    const section = student.section;
    return {
      viewer: {
        kind: 'student',
        id: student.id,
        name: student.name,
        groupLabel: section?.displayName ?? '',
        place: {
          sectionId: student.sectionId,
          cohortId: section?.cohortId ?? null,
          programmeId: section?.cohort.batch.programmeId ?? null,
          departmentId: section?.cohort.batch.branch.departmentId ?? null,
        },
        electiveSectionIds: student.electives.map((e) => e.electiveSectionId),
      },
      // Sections belong to one term's cohort: the student's term is their section's.
      termId: section?.cohort.termId ?? null,
      query: student.subGroupId
        ? { subGroupId: student.subGroupId }
        : student.sectionId
          ? { sectionId: student.sectionId }
          : {},
      programme: section
        ? { id: section.cohort.batch.programmeId, semester: section.cohort.semester }
        : null,
    };
  }

  /** The active term on the date, else any term on the date, else the latest active term. */
  async termOn(tx: TxClient, date: string): Promise<string | null> {
    const day = new Date(`${date}T00:00:00Z`);
    const terms = await tx.term.findMany({
      where: { deletedAt: null, status: { not: 'closed' } },
      select: { id: true, status: true, startDate: true, endDate: true },
      orderBy: { startDate: 'desc' },
    });
    const covers = (t: (typeof terms)[number]) => t.startDate <= day && day <= t.endDate;
    return (
      (
        terms.find((t) => t.status === 'active' && covers(t)) ??
        terms.find(covers) ??
        terms.find((t) => t.status === 'active')
      )?.id ?? null
    );
  }

  /** Holidays, extra working days, working days and section places for the dates. */
  async calendar(
    tx: TxClient,
    resolved: ResolvedViewer,
    from: string,
    to: string,
    slotWeekdays: readonly number[],
  ): Promise<PortalCalendar> {
    const termId = resolved.termId;
    const [term, holidays, extraDays, sections, workingDays] = await Promise.all([
      termId
        ? tx.term.findFirst({ where: { id: termId }, select: { startDate: true, endDate: true } })
        : null,
      tx.holiday.findMany({
        where: {
          deletedAt: null,
          startDate: { lte: new Date(`${to}T00:00:00Z`) },
          endDate: { gte: new Date(`${from}T00:00:00Z`) },
        },
      }),
      termId
        ? tx.extraWorkingDay.findMany({
            where: {
              termId,
              deletedAt: null,
              date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
            },
          })
        : [],
      termId
        ? tx.section.findMany({
            where: { cohort: { termId }, deletedAt: null },
            select: {
              id: true,
              cohortId: true,
              cohort: {
                select: {
                  batch: {
                    select: { programmeId: true, branch: { select: { departmentId: true } } },
                  },
                },
              },
            },
          })
        : [],
      this.workingDays(tx, resolved.programme, slotWeekdays),
    ]);
    const scopeId = (row: {
      scopeType: PortalCalendar['holidays'][number]['scopeType'];
      departmentId: string | null;
      programmeId: string | null;
      cohortId: string | null;
      sectionId: string | null;
    }): string | null =>
      ({
        institute: null,
        department: row.departmentId,
        programme: row.programmeId,
        cohort: row.cohortId,
        section: row.sectionId,
      })[row.scopeType];

    return {
      workingDays,
      termStart: term ? isoDate(term.startDate) : '0000-01-01',
      termEnd: term ? isoDate(term.endDate) : '0000-01-01',
      holidays: holidays.map((h) => ({
        name: h.name,
        startDate: isoDate(h.startDate),
        endDate: isoDate(h.endDate),
        scopeType: h.scopeType,
        scopeId: scopeId(h),
        changedAt: h.updatedAt,
      })),
      extraDays: extraDays.map((d) => ({
        date: isoDate(d.date),
        followsWeekday: d.followsWeekday,
        scopeType: d.scopeType,
        scopeId: scopeId(d),
      })),
      places: new Map<string, CalendarPlace>(
        sections.map((s) => [
          s.id,
          {
            sectionId: s.id,
            cohortId: s.cohortId,
            programmeId: s.cohort.batch.programmeId,
            departmentId: s.cohort.batch.branch.departmentId,
          },
        ]),
      ),
    };
  }

  /**
   * Working days from the bell schedule (the programme's own one if it has one, else the
   * default); without a bell schedule, the weekdays the published week uses.
   */
  async workingDays(
    tx: TxClient,
    programme: ResolvedViewer['programme'],
    slotWeekdays: readonly number[],
  ): Promise<number[]> {
    const schedules = await tx.bellSchedule.findMany({
      where: { deletedAt: null },
      select: {
        workingDays: true,
        isDefault: true,
        programmes: { select: { programmeId: true, semesters: true } },
      },
    });
    const own = programme
      ? schedules.find((s) =>
          s.programmes.some(
            (p) =>
              p.programmeId === programme.id &&
              (p.semesters.length === 0 || p.semesters.includes(programme.semester)),
          ),
        )
      : undefined;
    const schedule = own ?? schedules.find((s) => s.isDefault);
    return schedule ? schedule.workingDays : [...new Set(slotWeekdays)].sort();
  }
}
