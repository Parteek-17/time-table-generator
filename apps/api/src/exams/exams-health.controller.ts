import { Controller, Get } from '@nestjs/common';
import { FeatureFlag } from '../common/feature-flag';
import { Public, SkipTenant } from '../common/decorators';

/** Placeholder from C0: 200 while the P6 flag is on, 404 when it is off. */
@Controller('exams/health')
@Public()
@SkipTenant()
@FeatureFlag('P6')
export class ExamsHealthController {
  @Get()
  health(): { status: 'ok'; area: 'exams' } {
    return { status: 'ok', area: 'exams' };
  }
}
