import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type TxClient } from '@slotwise/db';
import {
  dateSheetProblems,
  shortDate,
  type CreateExamInput,
  hallCapacity,
  hallFromRoom,
  type DateSheetChoicesDto,
  type DateSheetDto,
  type ExamTermDto,
  type DateSheetSessionDto,
  type ExamPaperInput,
  type ExamSessionInput,
  type ExamSummaryDto,
  type UpdateExamInput,
  type UpdateExamPaperInput,
} from '@slotwise/shared/exams';
import type { Tenant } from '../common/request-context';
import { PrismaService } from '../db/prisma.service';

const NO_EXAM = 'We could not find this exam. It may have been removed.';
const NO_SESSION = 'We could not find this exam session.';
const NO_PAPER = 'We could not find this paper on the date sheet.';
const PUBLISHED_SEATING =
  'Seating for this session is published. Build a new seating plan before changing it.';

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const asDate = (s: string): Date => new Date(`${s}T00:00:00Z`);

type ExamRow = Prisma.ExamGetPayload<{
  include: { sessions: { select: { date: true; _count: { select: { papers: true } } } } };
}>;

function summary(exam: ExamRow): ExamSummaryDto {
  const dates = exam.sessions.map((s) => iso(s.date)).sort();
  return {
    id: exam.id,
    termId: exam.termId,
    name: exam.name,
    status: exam.status,
    reserveSeatsPerHall: exam.reserveSeatsPerHall,
    studentsPerInvigilator: exam.studentsPerInvigilator,
    minInvigilatorsPerHall: exam.minInvigilatorsPerHall,
    sessionCount: exam.sessions.length,
    paperCount: exam.sessions.reduce((n, s) => n + s._count.papers, 0),
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
  };
}

const summaryInclude = {
  sessions: { select: { date: true, _count: { select: { papers: true } } } },
} as const;

/** Exams and their date sheets: sessions and the papers written in each. */
@Injectable()
export class DateSheetService {
  constructor(private readonly prisma: PrismaService) {}

  private tx<T>(tenant: Tenant, fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return this.prisma.tenant({ instituteId: tenant.institute.id, userId: tenant.user.id }, fn);
  }

  list(tenant: Tenant, termId?: string): Promise<ExamSummaryDto[]> {
    return this.tx(tenant, async (tx) => {
      const exams = await tx.exam.findMany({
        where: { deletedAt: null, ...(termId ? { termId } : {}) },
        include: summaryInclude,
        orderBy: { createdAt: 'desc' },
      });
      return exams.map(summary);
    });
  }

  create(tenant: Tenant, input: CreateExamInput): Promise<ExamSummaryDto> {
    return this.tx(tenant, async (tx) => {
      const term = await tx.term.findFirst({ where: { id: input.termId, deletedAt: null } });
      if (!term) throw new BadRequestException('Pick a term that still exists.');
      const exam = await tx.exam.create({
        data: { ...input, instituteId: tenant.institute.id },
        include: summaryInclude,
      });
      return summary(exam);
    });
  }

  update(tenant: Tenant, examId: string, input: UpdateExamInput): Promise<ExamSummaryDto> {
    return this.tx(tenant, async (tx) => {
      await this.exam(tx, examId);
      const exam = await tx.exam.update({
        where: { id: examId },
        data: input,
        include: summaryInclude,
      });
      return summary(exam);
    });
  }

  /** Soft delete: published seating plans may still point at it. */
  remove(tenant: Tenant, examId: string): Promise<void> {
    return this.tx(tenant, async (tx) => {
      await this.exam(tx, examId);
      await tx.exam.update({ where: { id: examId }, data: { deletedAt: new Date() } });
    });
  }

  dateSheet(tenant: Tenant, examId: string): Promise<DateSheetDto> {
    return this.tx(tenant, async (tx) => {
      const exam = await tx.exam.findFirst({
        where: { id: examId, deletedAt: null },
        include: {
          ...summaryInclude,
        },
      });
      if (!exam) throw new NotFoundException(NO_EXAM);
      const sessions = await tx.examSession.findMany({
        where: { examId },
        include: { papers: { include: { course: true }, orderBy: { createdAt: 'asc' } } },
        orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
      });
      const sectionIds = [
        ...new Set(sessions.flatMap((s) => s.papers.flatMap((p) => p.sectionIds))),
      ];
      const [sections, counts] = await Promise.all([
        tx.section.findMany({ where: { id: { in: sectionIds } } }),
        tx.student.groupBy({
          by: ['sectionId'],
          where: { sectionId: { in: sectionIds }, status: 'active', deletedAt: null },
          _count: { _all: true },
        }),
      ]);
      const names = new Map(
        sections.map((s) => [s.id, s.deletedAt ? '(removed section)' : s.displayName]),
      );
      const strength = new Map(counts.map((c) => [c.sectionId, c._count._all]));
      const dto: DateSheetSessionDto[] = sessions.map((s) => ({
        id: s.id,
        date: iso(s.date),
        label: s.label,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
        papers: s.papers.map((p) => ({
          id: p.id,
          courseId: p.courseId,
          code: p.course.code,
          title: p.course.title,
          sectionIds: p.sectionIds,
          sectionNames: p.sectionIds.map((id) => names.get(id) ?? '(removed section)'),
          studentCount: p.sectionIds.reduce((n, id) => n + (strength.get(id) ?? 0), 0),
        })),
      }));
      return { exam: summary(exam), sessions: dto, problems: dateSheetProblems(dto) };
    });
  }

  addSession(tenant: Tenant, examId: string, input: ExamSessionInput): Promise<{ id: string }> {
    return this.tx(tenant, async (tx) => {
      await this.exam(tx, examId);
      try {
        return await tx.examSession.create({
          data: { ...input, date: asDate(input.date), examId, instituteId: tenant.institute.id },
          select: { id: true },
        });
      } catch (error) {
        throw this.duplicateSession(error, input);
      }
    });
  }

  updateSession(tenant: Tenant, sessionId: string, input: ExamSessionInput): Promise<void> {
    return this.tx(tenant, async (tx) => {
      await this.session(tx, sessionId);
      await this.refuseIfPublished(tx, sessionId);
      try {
        await tx.examSession.update({
          where: { id: sessionId },
          data: { ...input, date: asDate(input.date) },
        });
      } catch (error) {
        throw this.duplicateSession(error, input);
      }
    });
  }

  removeSession(tenant: Tenant, sessionId: string): Promise<void> {
    return this.tx(tenant, async (tx) => {
      await this.session(tx, sessionId);
      await this.refuseIfPublished(tx, sessionId);
      await tx.examSession.delete({ where: { id: sessionId } });
    });
  }

  addPaper(tenant: Tenant, examId: string, input: ExamPaperInput): Promise<{ id: string }> {
    return this.tx(tenant, async (tx) => {
      await this.exam(tx, examId);
      const session = await this.session(tx, input.sessionId);
      if (session.examId !== examId) throw new BadRequestException(NO_SESSION);
      await this.refuseIfPublished(tx, session.id);
      const course = await tx.course.findFirst({ where: { id: input.courseId, deletedAt: null } });
      if (!course) throw new BadRequestException('Pick a course that still exists.');
      await this.checkSections(tx, input.sectionIds);
      try {
        return await tx.examPaper.create({
          data: { ...input, examId, instituteId: tenant.institute.id },
          select: { id: true },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException(
            `${course.code} is already on this date sheet. Move it instead of adding it again.`,
          );
        }
        throw error;
      }
    });
  }

  updatePaper(tenant: Tenant, paperId: string, input: UpdateExamPaperInput): Promise<void> {
    return this.tx(tenant, async (tx) => {
      const paper = await this.paper(tx, paperId);
      await this.refuseIfPublished(tx, paper.sessionId);
      if (input.sessionId && input.sessionId !== paper.sessionId) {
        const target = await this.session(tx, input.sessionId);
        if (target.examId !== paper.examId) throw new BadRequestException(NO_SESSION);
        await this.refuseIfPublished(tx, target.id);
      }
      if (input.sectionIds) await this.checkSections(tx, input.sectionIds);
      await tx.examPaper.update({ where: { id: paperId }, data: input });
    });
  }

  removePaper(tenant: Tenant, paperId: string): Promise<void> {
    return this.tx(tenant, async (tx) => {
      const paper = await this.paper(tx, paperId);
      await this.refuseIfPublished(tx, paper.sessionId);
      await tx.examPaper.delete({ where: { id: paperId } });
    });
  }

  terms(tenant: Tenant): Promise<ExamTermDto[]> {
    return this.tx(tenant, async (tx) => {
      const terms = await tx.term.findMany({
        where: { deletedAt: null },
        orderBy: { startDate: 'desc' },
      });
      return terms.map((t) => ({
        id: t.id,
        label: t.label,
        status: t.status,
        startDate: iso(t.startDate),
        endDate: iso(t.endDate),
      }));
    });
  }

  choices(tenant: Tenant, examId: string): Promise<DateSheetChoicesDto> {
    return this.tx(tenant, async (tx) => {
      const exam = await this.exam(tx, examId);
      const [assignments, sections, rooms] = await Promise.all([
        tx.teachingAssignment.findMany({
          where: { termId: exam.termId, deletedAt: null, course: { deletedAt: null } },
          select: { sectionId: true, course: true },
        }),
        tx.section.findMany({
          where: { deletedAt: null, cohort: { termId: exam.termId, deletedAt: null } },
          include: {
            cohort: { select: { semester: true } },
            _count: { select: { students: { where: { status: 'active', deletedAt: null } } } },
          },
          // "CS A" exists in every semester: order by semester, then name.
          orderBy: [{ cohort: { semester: 'asc' } }, { displayName: 'asc' }],
        }),
        tx.room.findMany({
          where: { deletedAt: null },
          orderBy: [{ floor: 'asc' }, { code: 'asc' }],
        }),
      ]);
      const courses = new Map<string, DateSheetChoicesDto['courses'][number]>();
      for (const a of assignments) {
        const c = courses.get(a.course.id) ?? {
          id: a.course.id,
          code: a.course.code,
          title: a.course.title,
          semester: a.course.semester,
          sectionIds: [],
        };
        if (a.sectionId && !c.sectionIds.includes(a.sectionId)) c.sectionIds.push(a.sectionId);
        courses.set(c.id, c);
      }
      return {
        courses: [...courses.values()].sort((x, y) => x.code.localeCompare(y.code)),
        sections: sections.map((s) => ({
          id: s.id,
          name: s.displayName,
          semester: s.cohort.semester,
          studentCount: s._count.students,
        })),
        rooms: rooms.flatMap((r) => {
          const hall = hallFromRoom(r, 0);
          return hall
            ? [
                {
                  id: r.id,
                  code: r.code,
                  floor: r.floor,
                  examSeats: hallCapacity(hall),
                  isAccessible: r.isAccessible,
                },
              ]
            : [];
        }),
      };
    });
  }

  private async exam(tx: TxClient, id: string) {
    const exam = await tx.exam.findFirst({ where: { id, deletedAt: null } });
    if (!exam) throw new NotFoundException(NO_EXAM);
    return exam;
  }

  private async session(tx: TxClient, id: string) {
    const session = await tx.examSession.findFirst({
      where: { id, exam: { deletedAt: null } },
    });
    if (!session) throw new NotFoundException(NO_SESSION);
    return session;
  }

  private async paper(tx: TxClient, id: string) {
    const paper = await tx.examPaper.findFirst({
      where: { id, session: { exam: { deletedAt: null } } },
    });
    if (!paper) throw new NotFoundException(NO_PAPER);
    return paper;
  }

  private async refuseIfPublished(tx: TxClient, sessionId: string): Promise<void> {
    const published = await tx.seatingPlan.count({ where: { sessionId, status: 'published' } });
    if (published > 0) throw new ConflictException(PUBLISHED_SEATING);
  }

  private async checkSections(tx: TxClient, ids: string[]): Promise<void> {
    const unique = [...new Set(ids)];
    const found = await tx.section.count({ where: { id: { in: unique }, deletedAt: null } });
    if (found !== unique.length || unique.length !== ids.length) {
      throw new BadRequestException(
        'Some of these sections no longer exist. Reload and try again.',
      );
    }
  }

  private duplicateSession(error: unknown, input: ExamSessionInput): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException(
        `There is already a ${input.label} session on ${shortDate(input.date)}.`,
      );
    }
    return error;
  }
}
