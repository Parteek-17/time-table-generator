import {
  applyDecorators,
  Injectable,
  NotFoundException,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isFlagOn, type Flag } from '@slotwise/shared';

const FEATURE_FLAG = 'slotwise:featureFlag';

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const flag = this.reflector.getAllAndOverride<Flag | undefined>(FEATURE_FLAG, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Off looks like a route that does not exist yet.
    if (flag && !isFlagOn(flag)) throw new NotFoundException();
    return true;
  }
}

/** Route or controller exists only while the stream's flag is on (packages/shared/src/flags.ts). */
export const FeatureFlag = (flag: Flag) =>
  applyDecorators(SetMetadata(FEATURE_FLAG, flag), UseGuards(FeatureFlagGuard));
