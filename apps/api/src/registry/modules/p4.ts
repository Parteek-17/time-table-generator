import type { Type } from '@nestjs/common';
import { RescheduleModule } from '../../reschedule/reschedule.module';

/** P4's Nest modules. Add yours here; app.module.ts picks them up via the registry. */
export const P4_MODULES: Type[] = [RescheduleModule];
