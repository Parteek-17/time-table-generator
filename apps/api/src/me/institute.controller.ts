import { Controller, Get } from '@nestjs/common';
import type { Institute } from '@slotwise/db';
import type { InstituteDto } from '@slotwise/shared';
import { CurrentInstitute, Public } from '../common/decorators';
import { toInstituteDto } from './me.controller';

/** Public: name and type of the institute on this subdomain, for the sign-in page. */
@Controller('institute')
@Public()
export class InstituteController {
  @Get()
  get(@CurrentInstitute() institute: Institute): InstituteDto {
    return toInstituteDto(institute);
  }
}
