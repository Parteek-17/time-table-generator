import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { isValidSlug } from '@slotwise/shared';
import { INSTITUTE_PROVISIONING_V1 } from '@slotwise/shared/contracts';
import { DEFAULT_PLAN, type Signup, type SignupResponse } from '@slotwise/shared/platform';
import { PrismaService } from '../db/prisma.service';
import { InstituteProvisioningService } from '../institute-provisioning/institute-provisioning.service';
import { SignupThrottle } from './signup-throttle';

/**
 * Self-serve sign-up: a new institute on the free trial, with the person signing up as its
 * first admin. They get an invite email; following it proves the address is theirs, and
 * only then do they get access.
 */
@Injectable()
export class SignupService {
  private readonly throttle = new SignupThrottle();

  constructor(
    private readonly provisioning: InstituteProvisioningService,
    private readonly prisma: PrismaService,
  ) {}

  async signup(input: Signup): Promise<SignupResponse> {
    if (!this.throttle.allow(input.adminEmail)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'too_many_signups',
          message: 'Too many sign-ups just now. Please try again tomorrow, or write to us.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const res = await this.provisioning.provision(
      {
        version: INSTITUTE_PROVISIONING_V1,
        name: input.instituteName,
        slug: input.slug,
        type: input.type,
        affiliatingUniversityName: input.affiliatingUniversityName,
        firstAdmin: { email: input.adminEmail, name: input.adminName },
        withSampleData: false,
        planCode: DEFAULT_PLAN,
      },
      { actorUserId: null, via: 'signup' },
    );
    return { url: res.url, slug: res.slug, email: input.adminEmail };
  }

  /** For the form's "address is free" hint. Institute addresses are public anyway. */
  async slugAvailable(slug: string): Promise<{ slug: string; available: boolean }> {
    const clean = slug.trim().toLowerCase();
    if (!isValidSlug(clean)) return { slug: clean, available: false };
    // institutes is a global table; soft-deleted institutes keep their slug.
    const taken = await this.prisma.institute.findUnique({
      where: { slug: clean },
      select: { id: true },
    });
    return { slug: clean, available: !taken };
  }
}
