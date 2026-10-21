import { Controller, Get } from '@nestjs/common';
import { Public, SkipTenant } from '../common/decorators';
import { PrismaService } from '../db/prisma.service';

@Controller('health')
@Public()
@SkipTenant()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health(): Promise<{ status: 'ok'; database: 'ok' }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'ok' };
  }
}
