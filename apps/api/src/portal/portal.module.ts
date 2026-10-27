import { Module } from '@nestjs/common';
import { ENV } from '../config/env';
import { PortalHealthController } from './portal-health.controller';
import { PortalViewerService } from './portal-viewer.service';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { PORTAL_API_BASE, portalApiBase, PublishedTimetableClient } from './timetable.client';

/** Student and faculty portals ("Today", week view, exam seat). Owned by P5. */
@Module({
  controllers: [PortalHealthController, PortalController],
  providers: [
    { provide: PORTAL_API_BASE, useFactory: portalApiBase, inject: [ENV] },
    PublishedTimetableClient,
    PortalViewerService,
    PortalService,
  ],
})
export class PortalModule {}
