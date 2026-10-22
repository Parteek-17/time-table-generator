import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AcademicsModule } from './academics/academics.module';
import { AuthGuard } from './auth/auth.guard';
import { CalendarModule } from './calendar/calendar.module';
import { CohortsModule } from './cohorts/cohorts.module';
import type { Env } from './config/env';
import { CoreModule } from './core/core.module';
import { FacultyModule } from './faculty/faculty.module';
import { HealthController } from './health/health.controller';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { InstituteModule } from './institute/institute.module';
import { InvitesController } from './invites/invites.controller';
import { InvitesService } from './invites/invites.service';
import { InstituteController } from './me/institute.controller';
import { MeController } from './me/me.controller';
import { MembersController } from './members/members.controller';
import { MembersService } from './members/members.service';
import { TenantGuard } from './tenancy/tenant.guard';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        CoreModule.forRoot(env),
        InstituteModule,
        AcademicsModule,
        CohortsModule,
        FacultyModule,
        InfrastructureModule,
        CalendarModule,
      ],
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
