# Ownership map

Source of truth for who may edit which files while streams work in parallel.
`pnpm check:ownership` (scripts/check-ownership.mjs) parses the fenced `ownership` blocks below,
so keep their format: the first line is `stream: <ID>`, then `branches:` and `paths:` with one
pattern per line. Patterns are globs relative to the repository root: `*` matches within one
path segment, `**` matches any number of segments, `{a,b}` is an alternative. `(app)` and
other parentheses are literal.

Changing this file is INT only (file a request in `requests/`).

## Streams

| Stream | Name             | Branches                | ADR numbers |
| ------ | ---------------- | ----------------------- | ----------- |
| P1     | Institute setup  | `feat/phase1-*`, `p1/*` | 0010–0029   |
| UI     | Design system    | `ui/*`                  | 0030–0039   |
| P2E    | Timetable engine | `p2e/*`                 | 0040–0049   |
| P2T    | Timetable module | `p2t/*`                 | 0050–0059   |
| P4     | Rescheduling     | `p4/*`                  | 0060–0069   |
| P5     | Portals          | `p5/*`                  | 0070–0079   |
| P6     | Exam seating     | `p6/*`                  | 0080–0089   |
| P7     | SaaS launch      | `p7/*`                  | 0090–0099   |
| INT    | Integrator       | `int/*`, `c0/*`         | 0100+       |

## Every stream may also edit

- `apps/web/src/registry/nav/<stream>.ts` and `apps/api/src/registry/modules/<stream>.ts`
  (`<stream>` in lower case, e.g. `p2t.ts`)
- `docs/coordination/status/<STREAM>.md`
- new files in `docs/coordination/requests/` (never edit or move existing ones; INT does)
- `docs/coordination/claude-md-proposals/<STREAM>.md`
- its own ADRs: `docs/adr/<NNNN>-*.md` with a number in the stream's range
- the `dependencies` / `devDependencies` of a `package.json` in a package it owns files in
  (`apps/web`, `apps/api`, `packages/db`, `packages/shared`, `packages/ui`), and
  `pnpm-lock.yaml` together with such a change (INT resolves lockfile conflicts). For the solver:
  `services/solver/pyproject.toml` dependencies and `services/solver/uv.lock` (P2E, P6).
- **Back-relation fields in another stream's `.prisma` file.** Prisma needs both sides of a
  relation, so when your model points at `Institute` you may add the matching line
  `timetables Timetable[]` (or `Model?`, optionally with `@relation("Name")`) to the other
  model. Only bare back-relation lines to a model defined in your own schema file are allowed;
  anything else in another stream's file fails the check. INT resolves neighbouring-line
  conflicts when merging.

## P1 — Institute setup

```ownership
stream: P1
branches:
  feat/phase1-*
  p1/*
paths:
  apps/api/src/{institute,academics,cohorts,faculty,infrastructure,calendar,masterdata,teaching,imports,readiness,setup,snapshot}/**
  apps/web/src/app/(app)/{batches,bell-schedules,calendar,cohorts,departments,faculty,programmes,rooms,schemes,settings,students,terms,teaching,imports,readiness,setup}/**
  apps/web/src/app/(app)/me/availability/**
  apps/web/src/components/entity/**
  apps/web/src/components/term-picker*
  apps/web/src/components/availability-grid*
  apps/web/src/lib/entity-actions.ts
  apps/web/src/lib/terms.ts
  apps/web/messages/en/p1.json
  packages/db/prisma/schema/setup.prisma
  packages/db/src/readiness-snapshot.ts
  packages/db/src/sample/**
  packages/db/prisma/seed/p1.ts
  packages/shared/src/domain/**
  packages/shared/src/schemas/**
  apps/api/test/masterdata*
  apps/web/e2e/p1/**
```

## UI — Design system

```ownership
stream: UI
branches:
  ui/*
paths:
  packages/ui/**
  apps/web/src/app/globals.css
  apps/web/src/app/layout.tsx
  apps/web/src/components/{app-shell,app-nav,page-shell,problem}.tsx
  apps/web/src/app/(dev)/**
  apps/web/messages/en/ui.json
  apps/web/public/fonts/**
  apps/web/public/brand/**
```

## P2E — Timetable engine

```ownership
stream: P2E
branches:
  p2e/*
paths:
  services/solver/src/slotwise_solver/timetable/**
  services/solver/tests/timetable/**
```

## P2T — Timetable module

```ownership
stream: P2T
branches:
  p2t/*
paths:
  apps/api/src/timetable/**
  apps/web/src/app/(app)/timetable/**
  packages/db/prisma/schema/timetable.prisma
  packages/db/prisma/seed/p2t.ts
  packages/shared/src/timetable/**
  apps/web/messages/en/p2t.json
  apps/web/e2e/p2t/**
```

## P4 — Rescheduling

```ownership
stream: P4
branches:
  p4/*
paths:
  apps/api/src/{reschedule,notify}/**
  apps/web/src/app/(app)/reschedule/**
  packages/db/prisma/schema/reschedule.prisma
  packages/db/prisma/seed/p4.ts
  packages/shared/src/reschedule/**
  apps/web/messages/en/p4.json
  apps/web/e2e/p4/**
```

## P5 — Portals

```ownership
stream: P5
branches:
  p5/*
paths:
  apps/web/src/app/(portal)/**
  apps/api/src/portal/**
  apps/api/src/auth/otp/**
  apps/web/public/manifest*
  apps/web/src/pwa/**
  packages/db/prisma/schema/portal.prisma
  packages/db/prisma/seed/p5.ts
  packages/shared/src/portal/**
  apps/web/messages/en/p5.json
  apps/web/e2e/p5/**
```

## P6 — Exam seating

```ownership
stream: P6
branches:
  p6/*
paths:
  apps/api/src/exams/**
  apps/web/src/app/(app)/exams/**
  services/solver/src/slotwise_solver/seating/**
  services/solver/tests/seating/**
  packages/db/prisma/schema/exams.prisma
  packages/db/prisma/seed/p6.ts
  packages/shared/src/exams/**
  apps/web/messages/en/p6.json
  apps/web/e2e/p6/**
```

## P7 — SaaS launch

```ownership
stream: P7
branches:
  p7/*
paths:
  apps/api/src/{platform,billing,signup}/**
  apps/web/src/app/(marketing)/**
  apps/web/src/app/(platform)/**
  packages/db/prisma/schema/platform.prisma
  packages/db/prisma/seed/p7.ts
  packages/shared/src/platform/**
  apps/web/messages/en/p7.json
  apps/web/e2e/p7/**
```

## INT — Integrator

INT may edit everything. The paths below are the shared files nobody else may touch; they are
listed for reference (the checker gives INT `**`).

- root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`,
  `docker-compose.yml`, `.github/**`, `CLAUDE.md`, `infra/**`, `scripts/**`
- `apps/api/src/{app.module.ts,registry,core,common,config,db,auth (except otp),tenancy,audit,mail,health,me,members,invites,queue,institute-provisioning}/**`
- `apps/web/src/{auth.ts,proxy.ts,registry,i18n}/**`,
  `apps/web/src/lib/{api,env,me,prisma,redirect,labels}.ts`
- `apps/web/src/app/{page.tsx,actions.ts,sign-in,check-email,invite,api}/**`,
  `apps/web/src/app/(app)/{layout.tsx,members,audit}/**`
- `apps/web/messages/en/core.json`
- `packages/db/prisma/schema/core.prisma`, `packages/db/prisma/migrations/**`,
  `packages/db/prisma/seed.ts`, `packages/db/prisma.config.ts`
- `packages/shared/src/{auth,contracts,flags.ts,tenancy.ts,index.ts}`,
  `packages/shared/fixtures/**`, `packages/shared/package.json`
- `services/solver/src/slotwise_solver/main.py`, `services/solver/contracts/**`
- `docs/coordination/{OWNERSHIP,CONTRACTS,MERGE-ORDER}.md`

```ownership
stream: INT
branches:
  int/*
  c0/*
paths:
  **
```
