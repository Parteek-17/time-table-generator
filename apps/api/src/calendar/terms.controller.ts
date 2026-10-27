import { Controller, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { idParam, type TermRow } from '@slotwise/shared';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { toDto } from '../masterdata/entity';
import { MasterDataService } from '../masterdata/masterdata.service';
import { emitActivated, terms } from './calendar.entities';

/**
 * Makes a term the active one in one step: the term active before it is closed, and
 * `term.activated` tells the timetable, rescheduling and portal streams.
 */
@Controller('terms')
export class TermsController {
  constructor(private readonly md: MasterDataService) {}

  @Post(':id/activate')
  @HttpCode(200)
  @RequirePermission('term.manage')
  activate(
    @CurrentTenant() tenant: Tenant,
    @Param('id', new ZodPipe(idParam)) id: string,
  ): Promise<TermRow> {
    return this.md.run(tenant, async (ctx) => {
      this.md.assertCan(tenant, 'term.manage', this.md.resource(tenant, 'term', null));
      const { tx } = ctx;
      const term = await tx.term.findFirst({ where: { id, deletedAt: null } });
      if (!term) throw new NotFoundException('We could not find this term.');
      if (term.status !== 'active') {
        const previous = await tx.term.findFirst({
          where: { status: 'active', deletedAt: null },
          select: { id: true },
        });
        if (previous) {
          await tx.term.update({ where: { id: previous.id }, data: { status: 'closed' } });
          await this.md.audit(ctx, 'term.updated', 'term', previous.id, {
            changes: { status: { from: 'active', to: 'closed' } },
          });
        }
        await tx.term.update({ where: { id }, data: { status: 'active' } });
        await this.md.audit(ctx, 'term.updated', 'term', id, {
          changes: { status: { from: term.status, to: 'active' } },
        });
        emitActivated(ctx, id, previous?.id ?? null);
      }
      const row = await tx.term.findFirstOrThrow({ where: { id }, include: terms.include });
      return toDto(terms, row as Parameters<typeof terms.toInput>[0]);
    });
  }
}
