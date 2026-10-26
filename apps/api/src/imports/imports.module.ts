import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { StorageService } from './storage.service';

/** Excel/CSV import with templates (milestone 1d, ADR 0011). */
@Module({
  controllers: [ImportsController],
  providers: [ImportsService, StorageService],
})
export class ImportsModule {}
