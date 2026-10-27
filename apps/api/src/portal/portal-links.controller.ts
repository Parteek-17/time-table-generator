import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post } from '@nestjs/common';
import type { Institute } from '@slotwise/db';
import { idParam } from '@slotwise/shared';
import {
  CreatePublicLinkBody,
  type PortalFeedV1,
  type PublicLinksV1,
  type PublicLinkV1,
  type PublicTimetableV1,
} from '@slotwise/shared/portal';
import { z } from 'zod';
import { CurrentInstitute, CurrentTenant, Public, RequirePermission } from '../common/decorators';
import { FeatureFlag } from '../common/feature-flag';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PortalLinksService } from './portal-links.service';

/** A link token: `<uuid>.<signature>`, optionally ending in `.ics`. */
const LinkToken = z.string().regex(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{22}(\.ics)?$/);

/**
 * Calendar feeds (`/portal/feed…`) and public section / room links (`/portal/links…`,
 * `/portal/public/:token`). The two `:token` routes are public: whoever holds the link reads.
 */
@Controller('portal')
@FeatureFlag('P5')
export class PortalLinksController {
  constructor(private readonly links: PortalLinksService) {}

  @Get('feed')
  @RequirePermission('timetable.view')
  myFeed(@CurrentTenant() tenant: Tenant): Promise<PortalFeedV1> {
    return this.links.myFeed(tenant);
  }

  @Post('feed/reset')
  @HttpCode(200)
  @RequirePermission('timetable.view')
  resetFeed(@CurrentTenant() tenant: Tenant): Promise<PortalFeedV1> {
    return this.links.resetFeed(tenant);
  }

  @Get('feed/:token')
  @Public()
  @Header('content-type', 'text/calendar; charset=utf-8')
  @Header('cache-control', 'private, max-age=900')
  feedFile(
    @CurrentInstitute() institute: Institute,
    @Param('token', new ZodPipe(LinkToken)) token: string,
  ): Promise<string> {
    return this.links.feedFile(institute, token);
  }

  @Get('links')
  @RequirePermission('timetable.publish')
  listLinks(@CurrentTenant() tenant: Tenant): Promise<PublicLinksV1> {
    return this.links.listLinks(tenant);
  }

  @Post('links')
  @RequirePermission('timetable.publish')
  createLink(
    @CurrentTenant() tenant: Tenant,
    @Body(new ZodPipe(CreatePublicLinkBody)) body: CreatePublicLinkBody,
  ): Promise<PublicLinkV1> {
    return this.links.createLink(tenant, body);
  }

  @Delete('links/:id')
  @HttpCode(204)
  @RequirePermission('timetable.publish')
  revokeLink(
    @CurrentTenant() tenant: Tenant,
    @Param('id', new ZodPipe(idParam)) id: string,
  ): Promise<void> {
    return this.links.revokeLink(tenant, id);
  }

  @Get('public/:token')
  @Public()
  publicTimetable(
    @CurrentInstitute() institute: Institute,
    @Param('token', new ZodPipe(LinkToken)) token: string,
  ): Promise<PublicTimetableV1> {
    return this.links.publicTimetable(institute, token);
  }
}
