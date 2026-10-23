import { Controller, Get } from '@nestjs/common';
import { FeatureFlag } from '../common/feature-flag';
import { Public, SkipTenant } from '../common/decorators';

/** Placeholder from C0: 200 while the P7 flag is on, 404 when it is off. */
@Controller('platform/health')
@Public()
@SkipTenant()
@FeatureFlag('P7')
export class PlatformHealthController {
  @Get()
  health(): { status: 'ok'; area: 'platform' } {
    return { status: 'ok', area: 'platform' };
  }
}
