import type { SetupSnapshotV1 } from '@slotwise/shared/contracts';
import { demoTermSnapshot } from '@slotwise/shared/fixtures';

/**
 * Stand-in for P1's `GET /terms/:termId/snapshot` until it is on `main` (SNAPSHOT_SOURCE=fixture):
 * the demo term's snapshot, whatever term was asked for. Remove when INT says P1's endpoint
 * has landed.
 */
export function fixtureSnapshot(): SetupSnapshotV1 {
  return { ...demoTermSnapshot(), generatedAt: new Date().toISOString() };
}
