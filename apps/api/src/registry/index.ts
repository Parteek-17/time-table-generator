import type { Type } from '@nestjs/common';
import { P1_MODULES } from './modules/p1';
import { P2T_MODULES } from './modules/p2t';
import { P4_MODULES } from './modules/p4';
import { P5_MODULES } from './modules/p5';
import { P6_MODULES } from './modules/p6';
import { P7_MODULES } from './modules/p7';

/**
 * Every stream's Nest modules, in merge order (docs/coordination/MERGE-ORDER.md). Streams edit
 * only their own file in ./modules; this file and app.module.ts belong to INT.
 */
export const REGISTRY_MODULES: Type[] = [
  ...P1_MODULES,
  ...P2T_MODULES,
  ...P4_MODULES,
  ...P6_MODULES,
  ...P5_MODULES,
  ...P7_MODULES,
];
