import type { Prisma } from '@slotwise/db';

// Row types of P4's tables. @slotwise/db's export list is INT's file; these need no change there.
export type Disruption = Prisma.DisruptionGetPayload<object>;
export type Cancellation = Prisma.CancellationGetPayload<object>;
export type MakeUp = Prisma.MakeUpGetPayload<object>;
