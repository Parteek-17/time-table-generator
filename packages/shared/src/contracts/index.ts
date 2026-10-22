/**
 * Contracts between streams (docs/coordination/CONTRACTS.md). Import from
 * `@slotwise/shared/contracts`. Frozen once merged: a change is a new v2 file via an INT
 * request, never an edit to a v1 file.
 */
export * from './common.v1';
export * from './setup-snapshot.v1';
export * from './solver-timetable.v1';
export * from './timetable-read.v1';
export * from './events.v1';
export * from './notify.v1';
export * from './solver-seating.v1';
export * from './portal-read.v1';
export * from './institute-provisioning.v1';
