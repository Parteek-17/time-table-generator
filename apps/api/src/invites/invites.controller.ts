import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { Institute } from '@slotwise/db';
import {
  createInviteSchema,
  idParamSchema,
  inviteTokenSchema,
  type CreateInviteInput,
  type CreateInviteResponse,
  type InviteDto,
  type InvitePreviewDto,
  type MembershipDto,
} from '@slotwise/shared';
import {
  AllowNonMember,
  CurrentInstitute,
  CurrentTenant,
  Public,
  RequirePermission,
} from '../common/decorators';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { InvitesService } from './invites.service';

@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post()
  @RequirePermission('member.invite')
  create(
    @CurrentTenant() tenant: Tenant,
    @Body(new ZodPipe(createInviteSchema)) body: CreateInviteInput,
  ): Promise<CreateInviteResponse> {
    return this.invites.create(tenant, body);
  }

  @Get()
  @RequirePermission('member.invite')
  list(@CurrentTenant() tenant: Tenant): Promise<InviteDto[]> {
    return this.invites.listPending(tenant);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('member.invite')
  cancel(
    @CurrentTenant() tenant: Tenant,
    @Param('id', new ZodPipe(idParamSchema)) id: string,
  ): Promise<void> {
    return this.invites.cancel(tenant, id);
  }

  @Public()
  @Get('token/:token')
  preview(
    @CurrentInstitute() institute: Institute,
    @Param('token', new ZodPipe(inviteTokenSchema)) token: string,
  ): Promise<InvitePreviewDto> {
    return this.invites.preview(institute, token);
  }

  @AllowNonMember()
  @Post('token/:token/accept')
  accept(
    @CurrentTenant() tenant: Tenant,
    @Param('token', new ZodPipe(inviteTokenSchema)) token: string,
  ): Promise<MembershipDto> {
    return this.invites.accept(tenant, token);
  }
}
