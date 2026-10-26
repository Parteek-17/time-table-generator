import { Module } from '@nestjs/common';
import { SnapshotController } from './snapshot.controller';
import { SnapshotService } from './snapshot.service';

/** The setup snapshot (setup-snapshot.v1) other streams build timetables from. */
@Module({ controllers: [SnapshotController], providers: [SnapshotService] })
export class SnapshotModule {}
