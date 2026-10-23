import type { Type } from '@nestjs/common';
import { PlatformModule } from '../../platform/platform.module';

/** P7's Nest modules. Add yours here; app.module.ts picks them up via the registry. */
export const P7_MODULES: Type[] = [PlatformModule];
