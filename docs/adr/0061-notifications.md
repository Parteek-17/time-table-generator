# 0061 — Notifications (notify.v1) for cancellations and make-ups

- Status: accepted (P4, 2026-10-28)
- Stream: P4 — Rescheduling (owns `apps/api/src/notify`)

## Context

CLAUDE.md: notifications for cancellations and make-ups, email and push first, WhatsApp/SMS
later. `notify.v1` (CONTRACTS #5) lets any stream ask P4's notify module to tell people about
something; listeners must be idempotent and push long work onto their own queue.

## Decision

- **Pipeline.** Every notice is a `NotificationRequestV1`. `NotifyService.request()` validates
  it, refuses unknown templates, and adds a BullMQ job on `p4.notify` (job id = hash of
  institute + idempotency key, `sendAfter` as a delay, `urgent` as priority, 3 attempts with
  backoff). The worker resolves recipients, renders one email per person and sends it through
  INT's `MailService` (Mailpit locally, Resend in production).
- **Once per person.** `notification_deliveries` keeps (institute, idempotency key, channel,
  recipient) unique with sent/failed. A re-delivered job or a repeated request skips people
  already sent to; failed ones are tried again.
- **What P4 sends** (`notify.listener.ts`): one `p4.classesCancelled` per holiday/event/leave to
  every section and teacher whose classes it cancelled (not one email per class); one
  `p4.classCancelled` per class cancelled by hand; one `p4.makeUpBooked` per make-up (booked or
  moved). Nothing for dates already past; `urgent` for today. Off while `FLAG_P4` is off.
- **Recipients** come from the proposed `recipients.v1` (P1 implements; P4 never reads faculty or
  student tables), called as the user who caused the notice. Until it exists the adapter gets
  404 and nothing is sent.
- **Templates** live in `notify/templates.ts`, plain English, short; i18n with the rest later.

## Consequences

- No email reaches anyone until P1's recipients route lands; the whole path is tested with a
  fake recipients source and fake mail.
- `notify.requested` from other streams is accepted but not delivered until notify.v1 carries
  who asked, or INT provides a service identity (addendum in the recipients request).
- Push, WhatsApp and SMS are channels in the contract but not implemented.
