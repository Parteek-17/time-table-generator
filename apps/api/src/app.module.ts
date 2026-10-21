import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditService } from './audit/audit.service';
import { AuthGuard } from './auth/auth.guard';
import { ENV, type Env } from './config/env';
import { PrismaService } from './db/prisma.service';
import { DepartmentsController } from './departments/departments.controller';
import { HealthController } from './health/health.controller';
import { InvitesController } from './invites/invites.controller';
import { InvitesService } from './invites/invites.service';
import { MailService } from './mail/mail.service';
import { MeController } from './me/me.controller';
import { MembersController } from './members/members.controller';
import { MembersService } from './members/members.service';
import { TenantGuard } from './tenancy/tenant.guard';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        MeController,
        DepartmentsController,
        MembersController,
        InvitesController,
      ],
      providers: [
        { provide: ENV, useValue: env },
        PrismaService,
        AuditService,
        MailService,
        MembersService,
        InvitesService,
        // Order matters: sign-in first, then institute + membership + permission.
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: TenantGuard },
      ],
    };
  }
}
