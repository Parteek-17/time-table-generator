# Contracts

Streams talk to each other only through these contracts (zod + TypeScript, JSDoc on every
field) and the domain events. Import them from `@slotwise/shared/contracts`; never import
another stream's folders.

**Rule: a contract is frozen once merged to `main`.** A change is a new file (`*.v2.ts`, new
route or event name) proposed through an INT request (`requests/`); `v1` stays until every
consumer has moved. Additive changes are new versions too.

Routes are relative to the service: API routes to `API_URL` (the API has no `/api` prefix;
e.g. `GET /terms/:termId/snapshot`), solver routes to `SOLVER_URL`.

| #   | Contract                 | File (`packages/shared/src/contracts/`) | Version                     | Route / channel                                                          | Producer         | Consumers       | Fixture                                                    |
| --- | ------------------------ | --------------------------------------- | --------------------------- | ------------------------------------------------------------------------ | ---------------- | --------------- | ---------------------------------------------------------- |
| 0   | Shared building blocks   | `common.v1.ts`                          | v1                          | —                                                                        | INT              | all             | —                                                          |
| 1   | Setup snapshot           | `setup-snapshot.v1.ts`                  | `setup-snapshot.v1`         | `GET /terms/:termId/snapshot[?scopeId=]`                                 | P1               | P2T, P2E        | `demo-term.snapshot.json`                                  |
| 2   | Timetable solver         | `solver-timetable.v1.ts`                | `solver-timetable.v1`       | solver `POST /v1/timetable/solve` (from a job)                           | P2T → P2E        | P2T             | `demo-term.solution.json`                                  |
| 3   | Published timetable read | `timetable-read.v1.ts`                  | `timetable-read.v1`         | `GET /terms/:termId/timetable?sectionId\|subGroupId\|facultyId\|roomId=` | P2T              | P4, P5, P6      | `demo-term.published-timetable.json`                       |
| 4   | Domain events            | `events.v1.ts`                          | `events.v1`                 | NestJS EventEmitter (in-process)                                         | see table below  | see table below | —                                                          |
| 5   | Notification request     | `notify.v1.ts`                          | `notify.v1`                 | event `notify.requested`                                                 | any stream       | P4 (notify)     | —                                                          |
| 6   | Exam seating solver      | `solver-seating.v1.ts`                  | `solver-seating.v1`         | solver `POST /v1/seating/solve` (from a job)                             | P6               | P6              | `demo-exam.seating-request.json`, `…seating-response.json` |
| 7   | Portal "Today"           | `portal-read.v1.ts`                     | `portal-read.v1`            | `GET /portal/today[?date=]`                                              | P5 (API)         | P5 (web)        | `demo-student.today.json`                                  |
| 8   | Institute provisioning   | `institute-provisioning.v1.ts`          | `institute-provisioning.v1` | `POST /platform/institutes`                                              | INT (implements) | P7              | —                                                          |

### Events (`events.v1.ts`)

| Event                        | Producer | Consumers   |
| ---------------------------- | -------- | ----------- |
| `timetable.published`        | P2T      | P4, P5      |
| `timetable.version.archived` | P2T      | P4          |
| `disruption.created`         | P4       | P4, P5      |
| `class.cancelled`            | P4       | P4, P5      |
| `makeup.approved`            | P4       | P4, P5      |
| `exam.seating.published`     | P6       | P4, P5      |
| `institute.created`          | INT      | P1, P7      |
| `term.activated`             | P1       | P2T, P4, P5 |

Emit with `this.events.emit(name, parseEvent(name, payload))`; listen with
`@OnEvent(name)`. Listeners are idempotent (key on `eventId`) and push long work onto their
own queue (`QueueService`, apps/api/src/queue).

## Python side

`services/solver/contracts/timetable_v1.schema.json` and `seating_v1.schema.json` are
generated from the zod schemas (`$defs` holds the request and response). Field meanings are in
the JSDoc of the TypeScript files. Regenerate after a new version:

```bash
pnpm contracts:schemas
```

A test in `packages/shared` fails when the committed JSON differs from the zod source.

## Fixtures (`packages/shared/fixtures/`, `@slotwise/shared/fixtures`)

Fictional, built from P1's sample institute by `pnpm fixtures:build` (needs a seeded
database). Typed loaders validate on read: `demoTermSnapshot()`, `demoTermSolution()`,
`demoPublishedTimetable()`, `demoExamSeatingRequest()`, `demoExamSeatingResponse()`,
`demoStudentToday()`. The solution comes from a greedy placer, not the real solver: 20 of
414 sessions are unplaced (16 for lack of a suitable room, matching the sample data's planned
gaps), which makes it a useful INFEASIBLE example. Use fixtures and `*.mock.ts` files in your
own folder until the producer's code is on `main`.

## Feature flags (`packages/shared/src/flags.ts`)

`UI`, `P2T`, `P4`, `P5`, `P6`, `P7`, read from `FLAG_<ID>` (1/0). Unset: on in development
and test, off in production. API: `@FeatureFlag('P2T')` on a controller or route (404 when
off). Web: `isFlagOn('P2T')` in server components and your nav file.
