/**
 * Notification request v1. Any stream asks P4's notify module (apps/api/src/notify) to tell
 * people about something; notify resolves recipients, renders the template per channel and
 * sends (email and push first, WhatsApp/SMS later — CLAUDE.md).
 *
 * How: emit the request with EventEmitter under NOTIFY_REQUESTED_V1 ("notify.requested");
 * P4's notify module listens and queues the sending. Producer: any stream. Consumer: P4.
 */
import { z } from 'zod';
import { Id, IsoDateTime } from './common.v1';

export const NOTIFY_V1 = 'notify.v1' as const;
/** EventEmitter name for NotificationRequestV1. */
export const NOTIFY_REQUESTED_V1 = 'notify.requested' as const;

export const CHANNELS_V1 = ['email', 'push', 'whatsapp', 'sms'] as const;
export const ChannelV1 = z.enum(CHANNELS_V1);

export const NotificationRequestV1 = z.object({
  /** Always "notify.v1". */
  version: z.literal(NOTIFY_V1),
  /**
   * Same key = same notification: notify sends it once even if the request repeats
   * (e.g. `class.cancelled:<cancellationId>`).
   */
  idempotencyKey: z.string().min(8).max(200),
  /** Tenant. */
  instituteId: Id,
  /**
   * Template, namespaced by stream: `<stream>.<name>`, e.g. "p4.classCancelled". Templates
   * live with the producing stream's messages (apps/web/messages/en/<stream>.json for web
   * copy; notify owns the email layouts).
   */
  templateKey: z.string().regex(/^[a-z0-9]+\.[A-Za-z0-9.]+$/),
  /** Who gets it; at least one list must be non-empty. Duplicates are removed. */
  recipients: z
    .object({
      /** Specific users. */
      userIds: z.array(Id).default([]),
      /** Every student of these sections (and the section's class in-charge, if any). */
      sectionIds: z.array(Id).default([]),
      /** Every student of these sub-groups. */
      subGroupIds: z.array(Id).default([]),
      /** These faculty members (via their linked user). */
      facultyIds: z.array(Id).default([]),
    })
    .refine(
      (r) =>
        r.userIds.length + r.sectionIds.length + r.subGroupIds.length + r.facultyIds.length > 0,
      {
        message: 'Add at least one recipient.',
      },
    ),
  /** Values the template needs, e.g. { course: "CS301 DS", date: "2026-10-23" }. */
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  /** Channels to try, in order of preference. Recipients' own settings may narrow this. */
  channels: z.array(ChannelV1).min(1).default(['email']),
  /** urgent bypasses digests (e.g. a class cancelled within the next 2 hours). */
  priority: z.enum(['normal', 'urgent']).default('normal'),
  /** Do not send before this time (e.g. tomorrow 07:00 for a next-day change). */
  sendAfter: IsoDateTime.nullable().default(null),
});

export type NotificationRequestV1 = z.infer<typeof NotificationRequestV1>;
export type NotificationRequestV1Input = z.input<typeof NotificationRequestV1>;
