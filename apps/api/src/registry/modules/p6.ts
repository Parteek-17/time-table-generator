import type { Type } from '@nestjs/common';
import { ExamsModule } from '../../exams/exams.module';

/** P6's Nest modules. Add yours here; app.module.ts picks them up via the registry. */
export const P6_MODULES: Type[] = [ExamsModule];
