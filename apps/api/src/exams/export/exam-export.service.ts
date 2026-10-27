import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import {
  EXAM_DOCUMENT_NAMES,
  examDocument,
  type ExamExportQuery,
  type PlanOutputData,
} from '@slotwise/shared/exams';
import type { Tenant } from '../../common/request-context';
import { PrismaService } from '../../db/prisma.service';
import type { StoredHall } from '../seating/seating.service';
import { findBrowser, htmlToPdf, tablesToHtml } from './pdf';
import { tablesToXlsx } from './xlsx';

const NO_BROWSER =
  'PDF downloads are not set up on this server yet. Download Excel instead, or ask your administrator.';
const CONTENT_TYPE = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

export interface ExportFile {
  filename: string;
  contentType: string;
  body: Buffer;
}

/** Seating charts, the notice list, attendance sheets and the duty chart as PDF or Excel. */
@Injectable()
export class ExamExportService {
  constructor(private readonly prisma: PrismaService) {}

  async export(tenant: Tenant, planId: string, query: ExamExportQuery): Promise<ExportFile> {
    const data = await this.prisma.tenant(
      { instituteId: tenant.institute.id, userId: tenant.user.id },
      async (tx) => {
        const plan = await tx.seatingPlan.findFirst({
          where: {
            id: planId,
            status: { in: ['ready', 'published', 'archived'] },
            session: { exam: { deletedAt: null } },
          },
          include: { session: { include: { exam: true } }, seats: true, duties: true },
        });
        if (!plan) throw new NotFoundException('We could not find a finished seating plan here.');
        const students = await tx.student.findMany({
          where: { id: { in: plan.seats.map((s) => s.studentId) } },
          select: { id: true, name: true, section: { select: { displayName: true } } },
        });
        const who = new Map(students.map((s) => [s.id, s]));
        const halls = (plan.halls as unknown as StoredHall[]).map((h) => {
          const mine = plan.seats.filter((s) => s.hallId === h.hallId);
          return {
            id: h.hallId,
            code: h.code,
            // Plans built before geometry was stored: the furthest seat used.
            rows: h.rows || Math.max(0, ...mine.map((s) => s.row)),
            columns: h.columns || Math.max(0, ...mine.map((s) => s.column)),
          };
        });
        const out: PlanOutputData = {
          examName: plan.session.exam.name,
          date: plan.session.date.toISOString().slice(0, 10),
          sessionLabel: plan.session.label,
          startMinute: plan.session.startMinute,
          endMinute: plan.session.endMinute,
          halls,
          seats: plan.seats.map((s) => ({
            rollNo: s.rollNo,
            name: who.get(s.studentId)?.name ?? '',
            sectionName: who.get(s.studentId)?.section?.displayName ?? '',
            paperCode: s.paperCode,
            hallId: s.hallId,
            hallCode: s.hallCode,
            row: s.row,
            column: s.column,
            label: s.label,
          })),
          duties: plan.duties
            .map((d) => ({ facultyName: d.facultyName, hallId: d.hallId, hallCode: d.hallCode }))
            .sort((x, y) => x.facultyName.localeCompare(y.facultyName)),
        };
        return out;
      },
    );

    const tables = examDocument(query.doc, data);
    const landscape = query.doc === 'hall-chart';
    const filename = `${EXAM_DOCUMENT_NAMES[query.doc]}-${data.date}-${data.sessionLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}.${query.format}`;
    if (query.format === 'xlsx') {
      return {
        filename,
        contentType: CONTENT_TYPE.xlsx,
        body: await tablesToXlsx(tables, landscape),
      };
    }
    const browser = findBrowser(process.env.PDF_BROWSER_PATH);
    if (!browser) throw new ServiceUnavailableException(NO_BROWSER);
    const html = tablesToHtml(tables, filename, landscape);
    return {
      filename,
      contentType: CONTENT_TYPE.pdf,
      body: await htmlToPdf(html, browser, landscape),
    };
  }
}
