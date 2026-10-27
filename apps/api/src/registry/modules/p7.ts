import type { Type } from '@nestjs/common';
import { BillingModule } from '../../billing/billing.module';
import { PlatformModule } from '../../platform/platform.module';
import { SignupModule } from '../../signup/signup.module';

/** P7's Nest modules. Add yours here; app.module.ts picks them up via the registry. */
export const P7_MODULES: Type[] = [PlatformModule, BillingModule, SignupModule];
