import { Module } from '@nestjs/common';
import { TimetableModule } from '../timetable/timetable.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

/** "Ask Slotwise" chat assistant (Claude). Off unless ANTHROPIC_API_KEY is set. */
@Module({
  imports: [TimetableModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
