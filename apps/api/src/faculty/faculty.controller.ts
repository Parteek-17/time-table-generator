import { Body, Controller, Get, NotFoundException, Param, Post, Put } from '@nestjs/common';
import type { TxClient } from '@slotwise/db';
import {
  availabilitySchema,
  facultyBulkLoadSchema,
  idParam,
  type AvailabilityDto,
  type AvailabilityInput,
  type FacultyBulkLoadInput,
} from '@slotwise/shared';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { fieldError } from '../masterdata/entity';
import { MasterDataService } from '../masterdata/masterdata.service';

const id = new ZodPipe(idParam);
const live = { deletedAt: null };

/**
 * Availability (who may edit: admin, the hod of their home department, or the faculty member
 * themselves) and bulk load limits. Plain CRUD is in faculty.entities.ts.
 */
@Controller()
export class FacultyController {
  constructor(private readonly md: MasterDataService) {}

  /** The signed-in user's own faculty record, for "My availability". */
  @Get('me/faculty')
  me(@CurrentTenant() tenant: Tenant): Promise<{ facultyId: string | null }> {
    return this.md.run(tenant, async ({ tx }) => {
      const f = await tx.faculty.findFirst({
        where: { userId: tenant.user.id, ...live },
        select: { id: true },
      });
      return { facultyId: f?.id ?? null };
    });
  }

  @Get('faculty/:id/availability')
  @RequirePermission('masterdata.view')
  get(
    @CurrentTenant() tenant: Tenant,
    @Param('id', id) facultyId: string,
  ): Promise<AvailabilityDto> {
    return this.md.run(tenant, ({ tx }) => this.availability(tx, facultyId));
  }

  @Put('faculty/:id/availability')
  @RequirePermission('faculty.availability.edit')
  put(
    @CurrentTenant() tenant: Tenant,
    @Param('id', id) facultyId: string,
    @Body(new ZodPipe(availabilitySchema)) body: AvailabilityInput,
  ): Promise<AvailabilityDto> {
    return this.md.run(tenant, async (ctx) => {
      const { tx } = ctx;
      const f = await tx.faculty.findFirst({ where: { id: facultyId, ...live } });
      if (!f) throw new NotFoundException('We could not find this person.');
      this.md.assertCan(
        tenant,
        'faculty.availability.edit',
        this.md.resource(tenant, 'faculty', f.homeDepartmentId, { ownerUserId: f.userId }),
        'You can change only your own availability.',
      );
      const before = await tx.facultyUnavailability.count({ where: { facultyId } });
      const cells = new Map(body.unavailable.map((c) => [`${c.weekday}:${c.periodIndex}`, c]));
      await tx.facultyUnavailability.deleteMany({ where: { facultyId } });
      await tx.facultyUnavailability.createMany({
        data: [...cells.values()].map((c) => ({
          instituteId: tenant.institute.id,
          facultyId,
          ...c,
        })),
      });
      await this.md.audit(ctx, 'faculty.availability_updated', 'faculty', facultyId, {
        unavailableBefore: before,
        unavailableAfter: cells.size,
      });
      return this.availability(tx, facultyId);
    });
  }

  @Post('faculty/bulk-load')
  @RequirePermission('faculty.manage')
  bulkLoad(
    @CurrentTenant() tenant: Tenant,
    @Body(new ZodPipe(facultyBulkLoadSchema)) body: FacultyBulkLoadInput,
  ): Promise<{ updated: number }> {
    return this.md.run(tenant, async (ctx) => {
      const rows = await ctx.tx.faculty.findMany({
        where: { id: { in: body.facultyIds }, ...live },
      });
      if (rows.length !== new Set(body.facultyIds).size) {
        fieldError('facultyIds', 'Some of these people could not be found. Reload and try again.');
      }
      for (const f of rows) {
        this.md.assertCan(
          tenant,
          'faculty.manage',
          this.md.resource(tenant, 'faculty', f.homeDepartmentId),
          `You can’t change ${f.name}’s limits: they are in another department.`,
        );
      }
      for (const f of rows) {
        const data = {
          ...(body.maxPeriodsPerDay != null ? { maxPeriodsPerDay: body.maxPeriodsPerDay } : {}),
          ...(body.maxPeriodsPerWeek != null ? { maxPeriodsPerWeek: body.maxPeriodsPerWeek } : {}),
        };
        await ctx.tx.faculty.update({ where: { id: f.id }, data });
        await this.md.audit(ctx, 'faculty.updated', 'faculty', f.id, {
          changes: {
            ...(data.maxPeriodsPerDay != null
              ? { maxPeriodsPerDay: { from: f.maxPeriodsPerDay, to: data.maxPeriodsPerDay } }
              : {}),
            ...(data.maxPeriodsPerWeek != null
              ? { maxPeriodsPerWeek: { from: f.maxPeriodsPerWeek, to: data.maxPeriodsPerWeek } }
              : {}),
          },
        });
      }
      return { updated: rows.length };
    });
  }

  private async availability(tx: TxClient, facultyId: string): Promise<AvailabilityDto> {
    const f = await tx.faculty.findFirst({
      where: { id: facultyId, ...live },
      include: { unavailability: { orderBy: [{ weekday: 'asc' }, { periodIndex: 'asc' }] } },
    });
    if (!f) throw new NotFoundException('We could not find this person.');
    const bell = await tx.bellSchedule.findFirst({
      where: { isDefault: true, ...live },
      include: { periods: { orderBy: { index: 'asc' } } },
    });
    return {
      facultyId: f.id,
      name: f.name,
      shortCode: f.shortCode,
      workingDays: bell?.workingDays ?? [1, 2, 3, 4, 5],
      periods: (bell?.periods ?? []).map((p) => ({
        index: p.index,
        label: p.label,
        startMinute: p.startMinute,
        endMinute: p.endMinute,
      })),
      unavailable: f.unavailability.map((u) => ({
        weekday: u.weekday,
        periodIndex: u.periodIndex,
      })),
    };
  }
}
