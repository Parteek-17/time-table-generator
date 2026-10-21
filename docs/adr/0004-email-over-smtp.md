# ADR 0004: Send all email over SMTP (Mailpit locally, Resend in production)

- Status: accepted
- Date: 2026-10-21

## Context

CLAUDE.md picks Resend for email; the brief wants Mailpit to catch email locally. Two places
send email: Auth.js (sign-in links) and the API (invites).

## Decision

- Both use **Nodemailer over SMTP**, configured by one `EMAIL_SERVER` URL:
  - dev: `smtp://localhost:1025` (Mailpit, inbox at http://localhost:8025)
  - production: `smtp://resend:<RESEND_API_KEY>@smtp.resend.com:587` (Resend's SMTP relay)
- One code path everywhere, no "if production use the Resend SDK" branch, and local email
  looks exactly like production email.
- **Invite emails are sent inline, after the database transaction commits**, not through a
  BullMQ queue. If sending fails the invite is still saved and the admin gets a copyable link
  (for WhatsApp etc.). Redis runs in docker-compose but nothing uses it yet.

## Consequences

- Switching to Resend's HTTP API later (for webhooks/analytics) only touches `MailService`
  and the Auth.js `sendVerificationRequest`.
- Bulk invites (faculty sheet import) will need a queue; add BullMQ then.
