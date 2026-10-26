/** Editing a draft timetable: the API's input and output shapes. */
import { z } from 'zod';
import type { SetupSnapshotV1 } from '../contracts/setup-snapshot.v1';
import type { BusySlotV1, UnplacedSessionV1 } from '../contracts/solver-timetable.v1';
import type { EditorSlot, EditProblem } from './check';
import type { VersionSummaryDto } from './generate';

/** `POST /timetable/versions/:versionId/edits`: one change. Undo sends the opposite change. */
export const EditInput = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('move'),
    slotId: z.uuid(),
    weekday: z.int().min(1).max(7),
    startPeriodIndex: z.int().min(1),
    /** Room to use if it is free and suits (undo sends the old room); else the checker picks. */
    roomId: z.uuid().optional(),
  }),
  z.object({
    type: z.literal('lock'),
    slotId: z.uuid(),
    locked: z.boolean(),
  }),
]);
export type EditInput = z.infer<typeof EditInput>;

export interface EditResult {
  /** The slot after the change. */
  slot: EditorSlot;
  /** A move put the class in another room because its own was taken. */
  roomChanged: boolean;
}

/** Body of a refused edit (409). */
export interface EditRefusal {
  statusCode: 409;
  /** The first problem as an English sentence, for API callers. */
  message: string;
  problems: EditProblem[];
}

/** Everything the editing screen needs (`GET /timetable/versions/:versionId/editor`). */
export interface EditorDataDto {
  version: VersionSummaryDto;
  snapshot: SetupSnapshotV1;
  slots: EditorSlot[];
  /** Cells other published timetables of the term already use. */
  busy: BusySlotV1[];
  /** Sessions the solver could not place, with its reasons. */
  unplaced: UnplacedSessionV1[];
}
