import { Module } from '@nestjs/common';
import { NotifyListener } from './notify.listener';
import { NotifyService } from './notify.service';
import { RecipientsSource } from './recipients.source';

/** Notifications (notify.v1): email now, push and WhatsApp/SMS later. Owned by P4. */
@Module({ providers: [RecipientsSource, NotifyService, NotifyListener], exports: [NotifyService] })
export class NotifyModule {}
