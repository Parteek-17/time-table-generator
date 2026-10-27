# 0071 — Calendar feeds and public timetable links

- Status: accepted (P5)
- Date: 2026-10-27

## Context

CLAUDE.md "Access and login" asks for an iCal subscription per user (timetable changes appear
in Google Calendar) and public read-only links and QR codes for published section and room
timetables (notice boards, classroom doors, WhatsApp groups). Calendar apps and passers-by
can't sign in, so both need links that work on their own.

## Decision

1. **Signed row ids.** A link is `<row id>.<signature>`, the signature being 22 base64url
   characters of HMAC-SHA256(`ical|public:<id>`, `API_JWT_SECRET`) (`linkToken()` /
   `linkId()` in `@slotwise/shared/portal`). The row (`portal_calendar_feeds`,
   `portal_public_links`, RLS by institute) says whether the link still works. Tokens are not
   stored, so the same address can be shown again at any time; a stolen address is stopped by
   revoking the row ("Make a new address", "Stop this link").
2. **Calendar feed** (`/ical/<token>.ics` on the web, `GET /portal/feed/:token` on the API):
   built as the feed's owner with their current memberships (someone who left the institute
   gets 404). Last week to 120 days ahead within the term; classes as timed events in UTC,
   cancelled classes kept with `STATUS:CANCELLED`, holidays as all-day events; refresh hint
   6 hours.
3. **Public links** (`/p/<token>`, `GET /portal/public/:token`): made by people with
   `timetable.publish` for the section's department (rooms: institute-wide only). One live link
   per section or room. The page shows the weekly pattern of the currently published version,
   read through timetable-read.v1 **as the person who made the link**, so P2T's permission
   check still applies and P5 needs no system user. If they lose access, the link stops.
4. QR codes are SVG from the `qrcode` package, rendered on the server; "Download QR code"
   saves the same SVG for printing.

## Consequences

- No extra secret to manage; rotating `API_JWT_SECRET` breaks every feed and printed QR code
  (the same as it signs out the API tokens). Documented for deployment.
- A public link created by someone who later leaves stops working; the coordinator makes a new
  one. A dedicated `timetable.share` action could replace `timetable.publish` later (INT).
- Public pages and feeds call P2T's route once per request; calendar apps poll every few
  hours, and responses carry `cache-control: private, max-age=900`.
