import { Controller, Get } from '@nestjs/common';
import { FeatureFlag } from '../common/feature-flag';
import { Public, SkipTenant } from '../common/decorators';

/** Placeholder from C0: 200 while the P5 flag is on, 404 when it is off. */
@Controller('portal/health')
@Public()
@SkipTenant()
@FeatureFlag('P5')
export class PortalHealthController {
  @Get()
  health(): { status: 'ok'; area: 'portal' } {
    return { status: 'ok', area: 'portal' };
  }
}
