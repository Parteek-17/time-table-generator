import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import type { Institute } from '@slotwise/db';
import {
  OtpRequestBody,
  OtpVerifyBody,
  type OtpRequestResult,
  type OtpVerifyResult,
} from '@slotwise/shared/portal';
import { CurrentInstitute, Public } from '../../common/decorators';
import { FeatureFlag } from '../../common/feature-flag';
import { ZodPipe } from '../../common/zod.pipe';
import { OtpService } from './otp.service';

/**
 * `POST /auth/otp/request` and `POST /auth/otp/verify`: student sign-in by roll number and a
 * one-time code, for the institute on this subdomain. Public: the caller is not signed in yet.
 * The web app's server calls verify and only then creates the session (ADR 0070).
 */
@Controller('auth/otp')
@Public()
@FeatureFlag('P5')
export class OtpController {
  constructor(private readonly otp: OtpService) {}

  @Post('request')
  @HttpCode(200)
  request(
    @CurrentInstitute() institute: Institute,
    @Body(new ZodPipe(OtpRequestBody)) body: OtpRequestBody,
  ): Promise<OtpRequestResult> {
    return this.otp.request(institute, body.rollNumber);
  }

  @Post('verify')
  @HttpCode(200)
  verify(
    @CurrentInstitute() institute: Institute,
    @Body(new ZodPipe(OtpVerifyBody)) body: OtpVerifyBody,
  ): Promise<OtpVerifyResult> {
    return this.otp.verify(institute, body.rollNumber, body.code);
  }
}
