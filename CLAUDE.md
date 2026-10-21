# CLAUDE.md

Guidance for Claude (and humans) working in this repository.

## Project

**Slotwise** (working name): a multi-institute SaaS for colleges and universities that
1. collects institute master data through a setup wizard,
2. generates clash-free class timetables,
3. reschedules classes around holidays and events,
4. builds exam seating plans and invigilation duties.

Primary users are Indian engineering colleges and universities (semester system, L-T-P schemes, affiliated colleges).
A working single-page prototype exists in `prototype/slotwise.html`. Treat it as the reference for domain rules and UI direction, not as production code.

## Domain glossary

| Term | Meaning |
|---|---|
| Institute | A college or a university. A university can have affiliated colleges that share its scheme. |
| Department | e.g. CSE, ECE, Applied Sciences. Owns sections and faculty. |
| Programme / Semester / Section | B.Tech CSE → Sem 5 → CSE 5A. A section is the group that attends class together. |
| Batch / Group | Part of a section, used for labs (e.g. 5A-G1, 5A-G2). |
| Scheme | Official list of courses per semester with L-T-P and credits. |
| L-T-P | Lecture, Tutorial, Practical periods per week. Credits = L + T + P/2. |
| Syllabus hours | Contact hours a course must deliver in a semester. |
| Period / Slot | One teaching unit in the bell schedule (e.g. P3, 10:50–11:40). |
| Lab block | Consecutive periods for a practical (usually 2 or 3). |
| Room capacity | rows × seats per row. Exam capacity is separate (seats per bench in exams). |
| Event | Fest, exam, visit, etc. that cancels overlapping classes for a scope (institute, department, section). |
| Make-up | Replacement slot for a cancelled class. |
| Date sheet | Exam schedule: date, session, paper. |
| Invigilation duty | Faculty assigned to supervise an exam hall in a session. |

## Roles (RBAC)

Roles are **scoped**: a membership is `(user, role, scope_type, scope_id)` where scope is platform, university, institute, department or section. One user can hold several memberships.

| Role | Scope | Permissions |
|---|---|---|
| platform_admin | platform | Manage institutes, plans, support access |
| university_admin | university | Shared scheme/syllabus, affiliated colleges |
| institute_admin | institute | Setup wizard, departments, users, calendar, rooms |
| hod | department | Sections, faculty, subject allocation, approve department timetable |
| timetable_coordinator | department or institute | Generate, edit, publish timetables; reschedule |
| exam_coordinator | institute | Date sheets, seating plans, invigilation |
| faculty | self | View own timetable, set availability, request swap or leave |
| student | self | View class timetable and exam seat |

Rules:
- Every permission check goes through one authorization helper (`can(user, action, resource)`). Never inline role string checks in UI or route handlers.
- Students and faculty only ever read their own data plus published timetables.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) + TypeScript, Tailwind CSS, shadcn/ui, TanStack Table, dnd-kit for timetable editing |
| API | NestJS (TypeScript) — modules per domain, guards for RBAC |
| Database | PostgreSQL + Prisma |
| Solver | Python 3.12 service with Google OR-Tools (CP-SAT), FastAPI |
| Jobs | Redis + BullMQ (API side); solver called as a job, never inline in a request |
| Auth | Auth.js (email + Google). Roles stored in our DB, not in the auth provider |
| Files | S3-compatible storage for imports and generated PDFs |
| Exports | Puppeteer (PDF), ExcelJS (xlsx) |
| Email | Resend |
| Hosting | Vercel (web), Railway/Render (api, solver, redis), Neon or Supabase (Postgres) |

## Repository layout (target)

```
apps/
  web/          Next.js frontend
  api/          NestJS backend
services/
  solver/       Python OR-Tools service (timetable + exam seating)
packages/
  db/           Prisma schema, migrations, seed
  shared/       Shared TS types, zod schemas, constants (days, period math)
  ui/           Shared React components
prototype/
  slotwise.html Original browser prototype
docs/           Specs, ADRs, constraint definitions
```

Monorepo managed with **pnpm workspaces + Turborepo**.

## Commands (fill in as they are created)

```bash
pnpm install              # install all workspaces
pnpm dev                  # web + api in watch mode
pnpm db:migrate           # prisma migrate dev
pnpm db:seed              # seed sample institute (GNDEC-style CSE department, fictional data)
pnpm test                 # all TS tests
pnpm lint && pnpm typecheck
cd services/solver && uv run pytest
```

## Data model essentials

- **Multi-tenancy:** every tenant table has `institute_id`. All queries are scoped by it (Prisma middleware / Postgres row-level security). No cross-institute reads except platform_admin.
- Core entities: Institute, University, Department, Programme, Semester, Section, Batch, Student, Faculty, Building, Room, Scheme, Course, CourseOffering (course × section × faculty), BellSchedule, Break, AcademicCalendar, Holiday, Event, Timetable (versioned), TimetableSlot, Cancellation, MakeUp, Exam, ExamSession, SeatingPlan, SeatAssignment, InvigilationDuty, Membership.
- Timetables are **versioned**: draft → published → archived. Edits create a new draft; published versions are immutable.
- Store times as minutes-from-midnight ints and dates as `date` (no timezone). Institute timezone lives on Institute.

## Setup wizard (onboarding order)

1. Institute: name, type (college/university), affiliation, timezone
2. Departments → programmes → semesters → sections (+ student counts or roll list import)
3. Faculty: designation, experience (experienced/fresher), department, max periods per day/week
4. Infrastructure: blocks → rooms (type, rows, seats per row, exam seats per bench)
5. Scheme & syllabus: courses with L-T-P, credits, syllabus hours
6. Academic calendar: semester dates, holidays, exam windows

Every step is editable later and supports Excel/CSV bulk import with a preview + error report before commit.

## Scheduling rules

Hard constraints (never violated):
- No section, faculty member or room is double-booked.
- Room type matches (lecture hall vs lab) and capacity ≥ section/batch strength.
- Lab blocks are consecutive and never span a break ≥ 30 minutes.
- Faculty unavailability, max periods per day and per week are respected.
- Weekly periods per course = L + T + P from the scheme.

Soft constraints (minimised, weighted):
- Spread a course's theory periods across days (max one per day unless L+T > working days).
- Avoid more than 3 consecutive periods for a faculty member.
- Avoid late-day slots and idle gaps for sections.
- Keep a section in the same home room.

Rescheduling:
- Holidays and events cancel overlapping classes for their scope.
- Make-up slot must be free for section, faculty and a suitable room; search the same week first, then the next.
- Syllabus coverage = delivered periods (scheduled − lost) vs syllabus hours; warn below 100%, flag below 90%.

## Exam seating rules

- Two students writing the same paper never sit adjacent (left/right or front/back).
- Fill halls in roll-number order, interleaving papers/branches.
- Respect hall exam capacity; keep a configurable reserve of seats.
- Accessibility needs get ground-floor/front seats.
- Invigilation: balance duties across faculty, respect availability, never assign a faculty member to a hall writing their own subject.
- Outputs: hall seating chart, roll-no → hall notice list, attendance sheets, invigilator duty chart (PDF + Excel).

## Access and login

- One web app, one subdomain per institute (`<institute>.slotwise.app`), with the institute's name and logo. Installable as a PWA on phones; native Android app later if needed.
- Admins, HODs, coordinators: invited by email; log in with Google or email.
- Faculty: bulk-invited from the faculty sheet; log in with institute email or Google.
- Students: created from the roll list; log in with roll number + one-time code (email or phone). No passwords.
- Public read-only links and QR codes for published section/room timetables (notice boards, classroom doors, WhatsApp groups).
- Calendar subscription (iCal) per user so timetable changes appear in Google Calendar.
- Notifications for cancellations and make-ups: email and push first, WhatsApp/SMS later.

## Ease of use (product requirement, not polish)

Users are busy, non-technical college staff and students on phones. Every feature must pass these checks:

- **Start from their files.** Import the Excel sheets colleges already have. Auto-detect columns, preview, flag bad rows in plain language, fix them inline.
- **Sensible defaults.** Pre-fill bell schedule (09:00, 50-min periods, lunch after P4), Mon–Fri, load limits by experience. Users change only what differs.
- **One task per screen; wizard for setup.** Progress bar, save and resume, "skip for now". No 30-field forms.
- **Sample institute.** "Try with sample data" shows a full timetable in under a minute.
- **One-click generate, then tweak.** Drag and drop to adjust; show clashes instantly with the reason, and highlight valid slots while dragging.
- **Explain problems and offer fixes.** Not "Constraint violated" but "Dr. Kaur has no free period on Wed afternoon for CS501", with a button for each fix.
- **Undo instead of confirm.** Every edit is undoable; publishing keeps the previous version. Confirm only when deleting master data.
- **Role-shaped home screens.** Students and faculty land on "Today" (next class, room, changes); admins land on what needs attention.
- **Mobile first for students and faculty.** Today, week and exam seat within two taps; large tap targets; works on slow connections.
- **Plain words.** Section, period, lab, make-up, holiday. Never "entity", "constraint", "tenant" in the UI.
- **Language.** English first, all strings in i18n files so Hindi and Punjabi can follow.
- **Accessible.** Keyboard navigable, good contrast, screen-reader labels, never colour alone.
- **Success targets.** A new admin publishes a timetable from their own Excel files in under 1 hour; a student finds their exam seat in under 10 seconds. Test each release with a real timetable in-charge.

## Coding conventions

- TypeScript strict mode everywhere; no `any` without a comment explaining why.
- Validate all API input with zod (shared schemas in `packages/shared`).
- Solver contract: JSON in, JSON out, versioned (`/v1/timetable/solve`, `/v1/seating/solve`). The solver is stateless; it never touches the database.
- Constraint changes need a test case in `services/solver/tests` with a small fixture.
- Domain logic (period math, credit calc, coverage) lives in `packages/shared` with unit tests, not in components.
- Name things as users say them: "section", "period", "make-up", not internal jargon.
- UI must work at phone width; students mostly check timetables on phones.
- Conventional commits (`feat:`, `fix:`, `chore:`). Small PRs per feature.

## Build order

1. Setup wizard, master data CRUD, roles, Excel import
2. Timetable generation + manual drag-and-drop editing, publish flow
3. Calendar, events, rescheduling, notifications
4. Exam seating + invigilation
5. Faculty and student portals

## Things to avoid

- Running the solver inside an HTTP request.
- Hard-coding days, period counts or break times; everything comes from the institute's bell schedule.
- Using real people's names or a real institute's branding in seed data.
- Deleting master data that published timetables reference; soft-delete instead.
