import { Module } from '@nestjs/common';
import { OtpController } from '../auth/otp/otp.controller';
import { OtpService } from '../auth/otp/otp.service';
import { ENV } from '../config/env';
import { PortalHealthController } from './portal-health.controller';
import { PortalLinksController } from './portal-links.controller';
import { PortalLinksService } from './portal-links.service';
import { PortalViewerService } from './portal-viewer.service';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { PORTAL_API_BASE, portalApiBase, PublishedTimetableClient } from './timetable.client';

/** Student and faculty portals ("Today", week view, exam seat) and student sign-in by code. Owned by P5. */
@Module({
  controllers: [PortalHealthController, PortalController, PortalLinksController, OtpController],
  providers: [
    { provide: PORTAL_API_BASE, useFactory: portalApiBase, inject: [ENV] },
    PublishedTimetableClient,
    PortalViewerService,
    PortalService,
    OtpService,
    PortalLinksService,
  ],
})
export class PortalModule {}
