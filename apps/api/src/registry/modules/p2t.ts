import type { Type } from '@nestjs/common';
import { TimetableModule } from '../../timetable/timetable.module';

/** P2T's Nest modules. Add yours here; app.module.ts picks them up via the registry. */
export const P2T_MODULES: Type[] = [TimetableModule];
