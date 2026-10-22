import { Body, Controller, Post } from '@nestjs/common';
import {
  holidayPasteSchema,
  parseHolidayLines,
  type HolidayPasteInput,
  type HolidayPasteResultDto,
} from '@slotwise/shared';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { date, requireRefs } from '../masterdata/entity';
import { MasterDataService } from '../masterdata/masterdata.service';
import { scopeOf, scopeRefs } from './calendar.entities';

/** Wizard step 10: paste lines like "2026-10-20, Dussehra". Good lines are saved, bad ones explained. */
@Controller('holidays')
export class HolidaysController {
  constructor(private readonly md: MasterDataService) {}

  @Post('paste')
  @RequirePermission('calendar.manage')
  paste(
    @CurrentTenant() tenant: Tenant,
    @Body(new ZodPipe(holidayPasteSchema)) body: HolidayPasteInput,
  ): Promise<HolidayPasteResultDto> {
    return this.md.run(tenant, async (ctx) => {
      this.md.assertCan(tenant, 'calendar.manage', this.md.resource(tenant, 'calendar', null));
      await requireRefs(scopeRefs(ctx.tx, body));
      const results = parseHolidayLines(body.text);
      const errors: HolidayPasteResultDto['errors'] = [];
      let created = 0;
      for (const r of results) {
        if (!r.ok) {
          errors.push({ line: r.line, text: r.text, message: r.message });
          continue;
        }
        const row = await ctx.tx.holiday.create({
          data: {
            instituteId: tenant.institute.id,
            name: r.holiday.name,
            startDate: date(r.holiday.startDate),
            endDate: date(r.holiday.endDate),
            ...scopeOf(body),
          },
        });
        await this.md.audit(ctx, 'holiday.created', 'holiday', row.id, { after: { ...r.holiday } });
        created++;
      }
      return { created, errors };
    });
  }
}
