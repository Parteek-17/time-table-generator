import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { AssistantService, ChatRequest } from './assistant.service';

/** "Ask Slotwise": everyone in the institute may ask; only editors get the editing tools. */
@Controller('assistant')
export class AssistantController {
  constructor(private readonly service: AssistantService) {}

  @Get()
  @RequirePermission('institute.view')
  status(): { enabled: boolean } {
    return { enabled: this.service.enabled };
  }

  @Post('chat')
  @HttpCode(200)
  @RequirePermission('institute.view')
  chat(
    @CurrentTenant() tenant: Tenant,
    @Body(new ZodPipe(ChatRequest)) body: ChatRequest,
  ): Promise<{ reply: string }> {
    return this.service.chat(tenant, body);
  }
}
