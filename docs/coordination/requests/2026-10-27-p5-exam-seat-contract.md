# Freeze P6's "my exams" read as a contract

- Stream: P5
- Streams affected: P6 (producer), INT (CONTRACTS.md)
- Files: `packages/shared/src/contracts/exam-seat-read.v1.ts` (new), `docs/coordination/CONTRACTS.md`

## What

Make P6's `GET /exams/me` (on `p6/seating`, `MyExamsDto` in `packages/shared/src/exams/me.ts`)
a versioned contract, `exam-seat-read.v1`, with zod + JSDoc like the others, and add it to the
contracts table: producer P6, consumer P5.

## Why

P5 milestone 4 shows a student's next exam seat on "Today" (portal-read.v1 `examSeat`,
CLAUDE.md "a student finds their exam seat in under 10 seconds"). Until the route is a
contract, P5 calls it over HTTP as the student and parses only the fields it reads with its own
schema (`MyExamsAdapter` in `packages/shared/src/portal/exam-seat.ts`): `seats[].date,
sessionLabel, startMinute, paperCode, paperTitle, hallCode, building, floor, seatLabel`. If
the shape changes, parsing fails and Today shows no seat (never a wrong one).

## Exact proposed diff

The zod form of today's `MyExamsDto` (fields as P6 has them), exported as `MyExamsV1` with
`EXAM_SEAT_READ_V1_ROUTE = '/exams/me'`. One addition worth considering in the same version:
a `reportingMinute` per seat (portal-read.v1's `ExamSeatV1` has one; P5 uses the session's
start until then).

After it lands P5 replaces `MyExamsAdapter` with the contract import.
