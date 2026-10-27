import { Injectable } from '@nestjs/common';
import type { TxClient } from '@slotwise/db';
import { todayIn, type MyExamsDto } from '@slotwise/shared/exams';
import type { Tenant } from '../../common/request-context';
import { PrismaService } from '../../db/prisma.service';

const EMPTY: MyExamsDto = { shows: null, name: null, rollNo: null, seats: [], duties: [] };
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * A signed-in student's exam seats and a teacher's duties, from published plans only, today
 * and later. Students are found by their sign-in email, teachers by their linked login (as the
 * portals do). Only ever the caller's own record.
 */
@Injectable()
export class MyExamsService {
  constructor(private readonly prisma: PrismaService) {}

  me(tenant: Tenant): Promise<MyExamsDto> {
    const from = new Date(`${todayIn(tenant.institute.timezone)}T00:00:00Z`);
    const published = {
      status: 'published' as const,
      session: { date: { gte: from }, exam: { deletedAt: null } },
    };
    return this.prisma.tenant(
      { instituteId: tenant.institute.id, userId: tenant.user.id },
      async (tx) => {
        const faculty = await tx.faculty.findFirst({
          where: { userId: tenant.user.id, deletedAt: null },
          select: { id: true, name: true },
        });
        if (faculty) {
          const duties = await tx.invigilationDuty.findMany({
            where: { facultyId: faculty.id, plan: published },
            include: { plan: { include: { session: true } } },
          });
          const rooms = await this.rooms(
            tx,
            duties.map((d) => d.hallId),
          );
          return {
            shows: 'duties',
            name: faculty.name,
            rollNo: null,
            seats: [],
            duties: duties
              .map((d) => ({
                date: iso(d.plan.session.date),
                sessionLabel: d.plan.session.label,
                startMinute: d.plan.session.startMinute,
                endMinute: d.plan.session.endMinute,
                hallCode: d.hallCode,
                building: rooms.get(d.hallId)?.building ?? null,
                floor: rooms.get(d.hallId)?.floor ?? null,
              }))
              .sort((x, y) => x.date.localeCompare(y.date) || x.startMinute - y.startMinute),
          };
        }

        const student = await tx.student.findFirst({
          where: {
            email: { equals: tenant.user.email, mode: 'insensitive' },
            status: 'active',
            deletedAt: null,
          },
          select: { id: true, name: true, classRollNo: true, universityRollNo: true },
        });
        if (!student) return EMPTY;
        const seats = await tx.seatAssignment.findMany({
          where: { studentId: student.id, plan: published },
          include: { plan: { include: { session: true } } },
        });
        const [rooms, papers] = await Promise.all([
          this.rooms(
            tx,
            seats.map((s) => s.hallId),
          ),
          tx.examPaper.findMany({
            where: { id: { in: seats.map((s) => s.paperId) } },
            select: { id: true, course: { select: { title: true } } },
          }),
        ]);
        const title = new Map(papers.map((p) => [p.id, p.course.title]));
        return {
          shows: 'seats',
          name: student.name,
          rollNo: student.universityRollNo ?? student.classRollNo,
          duties: [],
          seats: seats
            .map((s) => ({
              date: iso(s.plan.session.date),
              sessionLabel: s.plan.session.label,
              startMinute: s.plan.session.startMinute,
              endMinute: s.plan.session.endMinute,
              paperCode: s.paperCode,
              paperTitle: title.get(s.paperId) ?? s.paperCode,
              hallCode: s.hallCode,
              building: rooms.get(s.hallId)?.building ?? null,
              floor: rooms.get(s.hallId)?.floor ?? null,
              seatLabel: s.label,
              row: s.row,
              column: s.column,
            }))
            .sort((x, y) => x.date.localeCompare(y.date) || x.startMinute - y.startMinute),
        };
      },
    );
  }

  private async rooms(tx: TxClient, ids: string[]) {
    const rooms = await tx.room.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, floor: true, building: { select: { name: true } } },
    });
    return new Map(rooms.map((r) => [r.id, { floor: r.floor, building: r.building.name }]));
  }
}
