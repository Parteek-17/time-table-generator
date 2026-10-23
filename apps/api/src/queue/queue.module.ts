import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';

/** BullMQ connection for every stream (inject QueueService). */
@Global()
@Module({ providers: [QueueService], exports: [QueueService] })
export class QueueModule {}
