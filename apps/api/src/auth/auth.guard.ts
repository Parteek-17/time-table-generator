import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_JWT_AUDIENCE, API_JWT_ISSUER } from '@slotwise/shared';
import { jwtVerify } from 'jose';
import { IS_PUBLIC } from '../common/decorators';
import type { AppRequest } from '../common/request-context';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../db/prisma.service';

/**
 * Verifies the short-lived HS256 JWT minted by the web app (docs/adr/0001-auth.md)
 * and loads the user. Runs first on every route except @Public() ones.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly secret: Uint8Array;

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(ENV) env: Env,
  ) {
    this.secret = new TextEncoder().encode(env.API_JWT_SECRET);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AppRequest>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Please sign in.');

    let userId: string;
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: API_JWT_ISSUER,
        audience: API_JWT_AUDIENCE,
        algorithms: ['HS256'],
      });
      if (!payload.sub) throw new Error('missing sub');
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    // users is a global table (no RLS), so no tenant context is needed here.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new UnauthorizedException('Please sign in.');
    req.user = user;
    return true;
  }
}
