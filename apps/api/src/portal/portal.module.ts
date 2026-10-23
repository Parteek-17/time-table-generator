import { Module } from '@nestjs/common';
import { PortalHealthController } from './portal-health.controller';

/** Student and faculty portals ("Today", week view, exam seat). Owned by P5. */
@Module({ controllers: [PortalHealthController] })
export class PortalModule {}
