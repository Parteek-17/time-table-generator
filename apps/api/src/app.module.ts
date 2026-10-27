import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthGuard } from './auth/auth.guard';
import type { Env } from './config/env';
import { CoreModule } from './core/core.module';
import { HealthController } from './health/health.controller';
import { InstituteProvisioningModule } from './institute-provisioning/institute-provisioning.module';
import { InvitesController } from './invites/invites.controller';
import { InvitesService } from './invites/invites.service';
import { InstituteController } from './me/institute.controller';
import { MeController } from './me/me.controller';
import { MembersController } from './members/members.controller';
import { MembersService } from './members/members.service';
import { QueueModule } from './queue/queue.module';
import { REGISTRY_MODULES } from './registry';
import { TenantGuard } from './tenancy/tenant.guard';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        CoreModule.forRoot(env),
        // Domain events between streams (packages/shared/src/contracts/events.v1.ts).
        EventEmitterModule.forRoot(),
        QueueModule,
        // institute-provisioning.v1 (POST /platform/institutes), used by P1 and P7.
        InstituteProvisioningModule,
        // Stream modules (apps/api/src/registry/modules/<stream>.ts).
        ...REGISTRY_MODULES,
      ],
      // Phase 0 controllers.
      controllers: [
        HealthController,
        InstituteController,
        MeController,
        MembersController,
        InvitesController,
      ],
      providers: [
        MembersService,
        InvitesService,
        // Order matters: sign-in first, then institute + membership + permission.
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: TenantGuard },
      ],
    };
  }
}
