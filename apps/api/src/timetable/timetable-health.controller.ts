import { Controller, Get } from '@nestjs/common';
import { FeatureFlag } from '../common/feature-flag';
import { Public, SkipTenant } from '../common/decorators';

/** Placeholder from C0: 200 while the P2T flag is on, 404 when it is off. */
@Controller('timetable/health')
@Public()
@SkipTenant()
@FeatureFlag('P2T')
export class TimetableHealthController {
  @Get()
  health(): { status: 'ok'; area: 'timetable' } {
    return { status: 'ok', area: 'timetable' };
  }
}
