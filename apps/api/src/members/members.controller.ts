import { Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { idParamSchema, type MemberDto } from '@slotwise/shared';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { MembersService } from './members.service';

@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermission('member.view')
  list(@CurrentTenant() tenant: Tenant): Promise<MemberDto[]> {
    return this.members.list(tenant);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('member.revoke')
  revoke(
    @CurrentTenant() tenant: Tenant,
    @Param('id', new ZodPipe(idParamSchema)) id: string,
  ): Promise<void> {
    return this.members.revoke(tenant, id);
  }

  @Post(':id/restore')
  @HttpCode(204)
  @RequirePermission('member.invite')
  restore(
    @CurrentTenant() tenant: Tenant,
    @Param('id', new ZodPipe(idParamSchema)) id: string,
  ): Promise<void> {
    return this.members.restore(tenant, id);
  }
}
