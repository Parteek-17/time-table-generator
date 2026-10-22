import { Module } from '@nestjs/common';
import { PlatformHealthController } from './platform-health.controller';

/** Platform admin: institutes, plans, sign-up and billing. Owned by P7. */
@Module({ controllers: [PlatformHealthController] })
export class PlatformModule {}
