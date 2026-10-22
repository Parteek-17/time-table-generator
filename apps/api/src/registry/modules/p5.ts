import type { Type } from '@nestjs/common';
import { PortalModule } from '../../portal/portal.module';

/** P5's Nest modules. Add yours here; app.module.ts picks them up via the registry. */
export const P5_MODULES: Type[] = [PortalModule];
