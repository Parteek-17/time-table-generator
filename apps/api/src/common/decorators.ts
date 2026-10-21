import {
  createParamDecorator,
  InternalServerErrorException,
  SetMetadata,
  type ExecutionContext,
} from '@nestjs/common';
import type { Action } from '@slotwise/shared';
import type { Institute } from '@slotwise/db';
import type { AppRequest, SignedInUser, Tenant } from './request-context';

export const IS_PUBLIC = 'slotwise:isPublic';
export const SKIP_TENANT = 'slotwise:skipTenant';
export const ALLOW_NON_MEMBER = 'slotwise:allowNonMember';
export const REQUIRED_PERMISSION = 'slotwise:requiredPermission';

/** No sign-in needed. The institute is still resolved unless @SkipTenant() is also set. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route is not about an institute (e.g. /health). */
export const SkipTenant = () => SetMetadata(SKIP_TENANT, true);

/** Signed-in users without a membership in the institute may call it (accepting an invite). */
export const AllowNonMember = () => SetMetadata(ALLOW_NON_MEMBER, true);

/**
 * The caller must be able to do this action somewhere in the institute (canSomewhere()).
 * Services then check the exact resource with can().
 */
export const RequirePermission = (action: Action) => SetMetadata(REQUIRED_PERMISSION, action);

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Tenant => {
    const tenant = ctx.switchToHttp().getRequest<AppRequest>().tenant;
    if (!tenant) throw new InternalServerErrorException('Tenant not resolved for this route');
    return tenant;
  },
);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SignedInUser => {
    const user = ctx.switchToHttp().getRequest<AppRequest>().user;
    if (!user) throw new InternalServerErrorException('User not resolved for this route');
    return user;
  },
);

export const CurrentInstitute = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Institute => {
    const institute = ctx.switchToHttp().getRequest<AppRequest>().institute;
    if (!institute) throw new InternalServerErrorException('Institute not resolved for this route');
    return institute;
  },
);
