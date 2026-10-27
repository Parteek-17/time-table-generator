import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { signupSchema, type Signup, type SignupResponse } from '@slotwise/shared/platform';
import { Public, SkipTenant } from '../common/decorators';
import { FeatureFlag } from '../common/feature-flag';
import { ZodPipe } from '../common/zod.pipe';
import { SignupService } from './signup.service';

/** Public sign-up from the marketing site (no subdomain, no sign-in). */
@Controller('signup')
@Public()
@SkipTenant()
@FeatureFlag('P7')
export class SignupController {
  constructor(private readonly signups: SignupService) {}

  @Post()
  @HttpCode(201)
  signup(@Body(new ZodPipe(signupSchema)) body: Signup): Promise<SignupResponse> {
    return this.signups.signup(body);
  }

  @Get('slug')
  slug(@Query('slug') slug = ''): Promise<{ slug: string; available: boolean }> {
    return this.signups.slugAvailable(String(slug));
  }
}
