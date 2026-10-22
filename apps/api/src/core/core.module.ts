import { Global, Module, type DynamicModule } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../db/prisma.service';
import { MailService } from '../mail/mail.service';
import { MasterDataService } from '../masterdata/masterdata.service';

/** Services every domain module uses: database, audit log, mail, master-data writes. */
@Global()
@Module({})
export class CoreModule {
  static forRoot(env: Env): DynamicModule {
    const providers = [
      { provide: ENV, useValue: env },
      PrismaService,
      AuditService,
      MailService,
      MasterDataService,
    ];
    return { module: CoreModule, providers, exports: providers };
  }
}
