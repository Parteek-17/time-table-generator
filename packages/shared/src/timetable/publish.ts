/**
 * Publishing a timetable: the API's output shapes and the pure rules behind them (which
 * sections changed, from which date a version applies).
 */

/** `POST /timetable/versions/:versionId/publish`. */
export interface PublishResult {
  /** The version that is now published. */
  versionId: string;
  /** Its number (1, 2, 3 … per term and timetable group). */
  number: number;
  /** The version it replaced (now archived), if any. */
  previousVersionId: string | null;
  /** First date it applies to (YYYY-MM-DD). */
  validFrom: string;
  /** True when it was already published (a second click); nothing changed and no event went out. */
  alreadyPublished: boolean;
}

/**
 * `POST /timetable/versions/:versionId/undo-publish`: the published version is archived, the
 * one it replaced is published again, and an editable copy of the undone version is made so
 * no work is lost (published versions themselves never change).
 */
export interface UndoPublishResult {
  /** The version published again, or null when the undone one was the first. */
  restoredVersionId: string | null;
  /** The editable copy of the undone version. */
  draftVersionId: string;
}

/** The parts of a slot that decide whether a section's week changed. */
interface SlotForDiff {
  sessionId: string;
  sectionIds: readonly string[];
  weekday: number;
  startPeriodIndex: number;
  length: number;
  roomId: string | null;
  facultyIds: readonly string[];
}

const key = (s: SlotForDiff) =>
  [s.sessionId, s.weekday, s.startPeriodIndex, s.length, s.roomId ?? '', ...s.facultyIds].join('|');

/**
 * Sections whose week differs between two versions: a class added, removed, moved, or with
 * another room or teacher. With no previous version, every section in `allSectionIds`.
 */
export function changedSections(
  previous: readonly SlotForDiff[] | null,
  next: readonly SlotForDiff[],
  allSectionIds: readonly string[],
): string[] {
  if (!previous) return [...new Set(allSectionIds)].sort();
  const before = new Map(previous.map((s) => [key(s), s]));
  const after = new Map(next.map((s) => [key(s), s]));
  const changed = new Set<string>();
  for (const [k, s] of before) if (!after.has(k)) s.sectionIds.forEach((id) => changed.add(id));
  for (const [k, s] of after) if (!before.has(k)) s.sectionIds.forEach((id) => changed.add(id));
  return [...changed].sort();
}

/** `YYYY-MM-DD` of `now` in an IANA timezone. */
export function dateIn(now: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** The day before a `YYYY-MM-DD` date. */
export function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * First date a version published today applies to: today, but not before the term starts and
 * not after it ends.
 */
export function publishValidFrom(today: string, termStart: string, termEnd: string): string {
  if (today < termStart) return termStart;
  if (today > termEnd) return termEnd;
  return today;
}
