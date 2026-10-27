/**
 * Links that work without signing in: a person's calendar feed (iCal) and public read-only
 * timetables for notice boards and classroom doors. A link is `<row id>.<signature>`; the row
 * can be revoked ("make a new link"), the signature stops guessing ids.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Id } from '../contracts';

export type LinkPurpose = 'ical' | 'public';

function signature(purpose: LinkPurpose, id: string, secret: string): string {
  return createHmac('sha256', secret).update(`${purpose}:${id}`).digest('base64url').slice(0, 22);
}

/** The token for a link row. */
export function linkToken(purpose: LinkPurpose, id: string, secret: string): string {
  return `${id}.${signature(purpose, id, secret)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The row id if the token is genuine, else null. Accepts a trailing ".ics". */
export function linkId(purpose: LinkPurpose, token: string, secret: string): string | null {
  const [id, sig] = token.replace(/\.ics$/, '').split('.');
  if (!id || !sig || !UUID.test(id)) return null;
  const expected = Buffer.from(signature(purpose, id, secret));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

/** `GET /portal/feed` and `POST /portal/feed/reset`: the signed-in user's calendar link. */
export const PortalFeedV1 = z.object({
  /** Path on the institute's web address, e.g. `/ical/<token>.ics`. */
  path: z.string(),
  /** When the link was made. */
  createdAt: z.iso.datetime({ offset: true }),
});
export type PortalFeedV1 = z.infer<typeof PortalFeedV1>;

export const PUBLIC_LINK_KINDS = ['section', 'room'] as const;
export const PublicLinkKind = z.enum(PUBLIC_LINK_KINDS);
export type PublicLinkKind = z.infer<typeof PublicLinkKind>;

export const CreatePublicLinkBody = z.object({
  kind: PublicLinkKind,
  /** Section or room id. */
  targetId: Id,
});
export type CreatePublicLinkBody = z.infer<typeof CreatePublicLinkBody>;

export const PublicLinkV1 = z.object({
  id: Id,
  kind: PublicLinkKind,
  targetId: Id,
  /** e.g. "CS A" or "Room G16". */
  label: z.string(),
  /** Path on the institute's web address, e.g. `/p/<token>`. */
  path: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type PublicLinkV1 = z.infer<typeof PublicLinkV1>;

/** `GET /portal/links`: the institute's public links and what links can be made for. */
export const PublicLinksV1 = z.object({
  links: z.array(PublicLinkV1),
  choices: z.object({
    sections: z.array(z.object({ id: Id, label: z.string() })),
    rooms: z.array(z.object({ id: Id, label: z.string() })),
  }),
});
export type PublicLinksV1 = z.infer<typeof PublicLinksV1>;

/** One class on a public weekly timetable (no ids beyond what a notice board shows). */
export const PublicClassV1 = z.object({
  weekday: z.int().min(1).max(7),
  startMinute: z.int(),
  endMinute: z.int(),
  component: z.enum(['lecture', 'tutorial', 'practical']),
  courseCode: z.string(),
  courseShortName: z.string(),
  courseTitle: z.string(),
  /** Section / lab group / elective group. */
  group: z.string(),
  /** Teachers' names. */
  teachers: z.string(),
  roomCode: z.string().nullable(),
});
export type PublicClassV1 = z.infer<typeof PublicClassV1>;

/** `GET /portal/public/:token`: a published section's or room's week, for anyone. */
export const PublicTimetableV1 = z.object({
  instituteName: z.string(),
  kind: PublicLinkKind,
  label: z.string(),
  /** Working days (ISO weekdays) shown as rows. */
  workingDays: z.array(z.int().min(1).max(7)),
  /** Published version number, or null when nothing is published yet. */
  versionNumber: z.int().nullable(),
  /** First date the published version applies to. */
  validFrom: z.iso.date().nullable(),
  classes: z.array(PublicClassV1),
});
export type PublicTimetableV1 = z.infer<typeof PublicTimetableV1>;
