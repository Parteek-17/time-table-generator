# 0070 — Student sign-in with roll number and a one-time code

- Status: accepted (P5)
- Date: 2026-10-27

## Context

CLAUDE.md "Access and login": students are created from the roll list and sign in with their
roll number and a one-time code (email or phone); no passwords. Auth.js runs with database
sessions (ADR 0001), and its Credentials provider only works with JWT sessions, so it can't
create the session for us without changing INT's auth setup for everyone.

## Decision

1. **The API owns the codes** (`apps/api/src/auth/otp`, `POST /auth/otp/request|verify`, public,
   behind `FLAG_P5`). The student is found by class or university roll number (any case) in
   the institute on the subdomain; the code goes to the email on their record. Stored as
   `hashCode(code, API_JWT_SECRET)` in `portal_login_codes` (RLS by institute). Limits: 10
   minutes, 5 wrong tries, 3 codes per 15 minutes, only the newest code works.
2. **Verify** marks the code used, creates the user for the record's email if missing and a
   `student` membership scoped to their section (audited as `membership.created_by_code`).
3. **The web server makes the session through Auth.js's own email callback.** After verify
   succeeds, the server action stores a random 32-byte single-use token in
   `verification_tokens` exactly as the email provider does (`sha256(token + AUTH_SECRET)`,
   2 minutes) and redirects to `/api/auth/callback/nodemailer?token=…&email=…`. Auth.js then
   checks and deletes the token and creates the database session as for a magic link. No
   change to `auth.ts`.
4. Students are matched to their login by email (`Student.email`), the same way the portal
   finds "me" (M1). Phone-only codes wait for SMS (CLAUDE.md: email first).

## Consequences

- No new auth provider, no JWT sessions; students get the same 180-day sessions as staff.
- Step 3 depends on Auth.js's token hashing (`@auth/core` `lib/actions/callback`, sha256 hex of
  token + secret). A unit test pins the format (`otp.test.ts`); re-check on Auth.js upgrades.
  With rotated secrets (`AUTH_SECRET_1…`) the joined secret would differ; only `AUTH_SECRET`
  is supported.
- A student without an email on their record gets a plain message to ask their coordinator.
- Roll numbers are not secret, so "roll number not found" is answered plainly (usability over
  hiding which roll numbers exist); the masked email is shown so students know where to look.
