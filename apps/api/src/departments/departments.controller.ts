import { Controller, Get } from '@nestjs/common';
import type { DepartmentDto } from '@slotwise/shared';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import type { Tenant } from '../common/request-context';
import { PrismaService } from '../db/prisma.service';

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('department.view')
  list(@CurrentTenant() { institute, user }: Tenant): Promise<DepartmentDto[]> {
    return this.prisma.tenant({ instituteId: institute.id, userId: user.id }, (tx) =>
      tx.department.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
    );
  }
}
