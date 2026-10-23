import { Controller, Get } from '@nestjs/common';
import { FeatureFlag } from '../common/feature-flag';
import { Public, SkipTenant } from '../common/decorators';

/** Placeholder from C0: 200 while the P4 flag is on, 404 when it is off. */
@Controller('reschedule/health')
@Public()
@SkipTenant()
@FeatureFlag('P4')
export class RescheduleHealthController {
  @Get()
  health(): { status: 'ok'; area: 'reschedule' } {
    return { status: 'ok', area: 'reschedule' };
  }
}
