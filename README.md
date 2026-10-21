# Slotwise

Timetables, rescheduling and exam seating for colleges and universities.
**Phase 0 (Foundation):** sign-in, institutes on their own subdomain, scoped roles, invites
and row-level data isolation. No timetable features yet.

See [CLAUDE.md](CLAUDE.md) for the product, domain rules and conventions.

## Run it locally

You need **Node 24**, **pnpm 10** (`npm i -g pnpm@10.34.7`), **Docker Desktop**, and for the
solver **uv** (`pip install uv`).

1. `git clone <repo-url> slotwise && cd slotwise`
2. `docker compose up -d` starts Postgres 16, Redis 7 and Mailpit
3. `pnpm install` installs everything and creates `.env` files from each `.env.example`
4. `pnpm db:migrate` creates the tables and row-level security
5. `pnpm db:seed` adds the fictional **Demo Institute of Engineering**
6. `pnpm dev` starts the web app (port 3000) and API (port 4000)
7. Open **http://demo.localhost:3000** and sign in as `admin@demo.slotwise.test`
8. Open **http://localhost:8025** (Mailpit), click the sign-in link, then go to **Members** and
   invite someone

`*.localhost` addresses work in Chrome, Edge and Firefox with no setup. The bare
http://localhost:3000 shows a "choose your institute" page.

Seeded accounts (sign in with a magic link; no passwords):

| Email                          | Role                                           |
| ------------------------------ | ---------------------------------------------- |
| `admin@demo.slotwise.test`     | Institute admin, Demo Institute of Engineering |
| `platform.admin@slotwise.test` | Platform admin                                 |

## Commands

| Command                                                                  | What it does                                                                                   |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `pnpm dev`                                                               | Web + API in watch mode                                                                        |
| `pnpm build`                                                             | Build every package and app                                                                    |
| `pnpm lint` / `pnpm typecheck`                                           | ESLint / TypeScript across the repo                                                            |
| `pnpm test`                                                              | Unit tests (`can()`), RLS tests and API end-to-end tests (needs Postgres running and migrated) |
| `pnpm format`                                                            | Prettier                                                                                       |
| `pnpm db:migrate`                                                        | `prisma migrate dev` (create/apply migrations locally)                                         |
| `pnpm db:deploy`                                                         | `prisma migrate deploy` (hosted databases)                                                     |
| `pnpm db:seed`                                                           | Seed the demo institute (safe to re-run)                                                       |
| `pnpm db:reset`                                                          | Drop, re-migrate and re-seed the local database                                                |
| `cd services/solver && uv run pytest`                                    | Solver tests                                                                                   |
| `cd services/solver && uv run uvicorn slotwise_solver.main:app --reload` | Solver on :8000                                                                                |

## Repository layout

```
apps/
  web/            Next.js 16 (App Router) + Auth.js + Tailwind + next-intl
  api/            NestJS 11: auth, tenant guard, members, invites, audit
services/
  solver/         FastAPI + uv (OR-Tools arrives in Phase 2)
packages/
  db/             Prisma schema, migrations (incl. row-level security), seed, RLS tests
  shared/         Roles, permission map, can(), zod schemas, tenancy helpers
  ui/             Shared shadcn-style components
  config/         Shared tsconfig, ESLint and Prettier setup
infra/postgres/   Dev database init (creates the restricted app role)
docs/
  adr/            Architecture decisions (auth, tenancy/RLS, email, versions, …)
  deployment.md   Connecting a hosted database and deploying
```

## How access works (short version)

- **Which institute?** The subdomain: `demo.localhost:3000` → `demo`.
- **Who are you?** Auth.js session in the web app; the web calls the API with a 5-minute
  signed token (ADR 0001).
- **May you?** Memberships `(user, role, scope)` and one function, `can(user, action,
resource)`, in `packages/shared`. ESLint fails on inline role-string checks.
- **Can a bug leak data?** Postgres row-level security filters every tenant table by the
  current institute, even for raw SQL (ADR 0002, `packages/db/test/rls.test.ts`).

## Deploying

See [docs/deployment.md](docs/deployment.md) for Neon/Supabase, Vercel, Railway, Resend and
Google sign-in, plus putting the repo on GitHub.

## Troubleshooting

- **Port 5432 already in use:** another Postgres is running. Stop it, or change the port
  mapping in `docker-compose.yml` and the URLs in the `.env` files.
- **API says "not restricted by row-level security":** `apps/api/.env` `DATABASE_URL` must use
  `slotwise_app`, not the owner user.
- **Changed `.env.example`?** Existing `.env` files are never overwritten; copy new lines by hand.
- **Fresh database:** `docker compose down -v && docker compose up -d`, then migrate and seed.
