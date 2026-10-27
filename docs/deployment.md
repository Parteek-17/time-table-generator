# Connecting a database and deploying Slotwise

This is the path from "works on my laptop" to a hosted staging or production setup, using the
hosts in CLAUDE.md: **Neon** (or Supabase) for Postgres, **Vercel** for the web app,
**Railway** (or Render) for the API, the solver and Redis, and **Resend** for email.

Do it first as **staging** (e.g. `*.staging.slotwise.app`), then repeat for production.

```
           ┌────────────── Vercel ──────────────┐
 browser ─▶│ apps/web  (*.slotwise.app)         │──HTTPS + JWT──▶ Railway: apps/api ──▶ Railway: solver (later)
           └──────────────┬─────────────────────┘                     │        └──▶ Railway: Redis (later)
                          │ slotwise_app (RLS)                         │ slotwise_app (RLS)
                          ▼                                            ▼
                         Neon Postgres  ◀── owner role: migrations only (CI or your machine)
                         Resend SMTP    ◀── sign-in and invite emails (web + api)
```

---

## 1. Put the code on GitHub

1. Create an **empty** repository on GitHub (no README, licence or .gitignore; the repo
   already has them), e.g. `slotwise`. Private is fine.
2. From the project folder:
   ```bash
   git remote add origin https://github.com/<you>/slotwise.git
   git push -u origin main
   ```
3. The **CI** workflow (`.github/workflows/ci.yml`) runs on every push and pull request. It
   needs no secrets: it starts its own Postgres.
4. Settings → Branches → add a rule for `main`: require a pull request and require the
   **CI** checks to pass. Work on branches (`feat/…`, `fix/…`) and merge small PRs.
5. Settings → Code security → enable **Dependabot** alerts. `.github/dependabot.yml` already
   asks for weekly update PRs.

Never commit `.env` files. Only `.env.example` files are tracked (`.gitignore` enforces it).

---

## 2. Create the database

### Neon (recommended)

1. Create a project in region **AWS Asia Pacific (Mumbai)**, Postgres **16**.
2. You get an owner role (e.g. `neondb_owner`) and database `neondb`. Copy two connection
   strings from _Connect_:
   - **Direct** (host without `-pooler`): for migrations.
   - **Pooled** (host with `-pooler`): for the running apps.
3. Open the **SQL editor** and create the restricted app role. Use SQL, not the console's
   "Add role" button, so the role gets no extra privileges:
   ```sql
   CREATE ROLE slotwise_app LOGIN PASSWORD '<long random password>' NOSUPERUSER NOBYPASSRLS;
   ```
   (If you ran the migrations first, the migration already created `slotwise_app` without a
   login. Then run `ALTER ROLE slotwise_app LOGIN PASSWORD '<…>';` instead.)
4. Build your URLs:

   | Variable                  | Value                                                                                              |
   | ------------------------- | -------------------------------------------------------------------------------------------------- |
   | `OWNER_DATABASE_URL`      | direct URL with the **owner** user, plus `?sslmode=require`                                        |
   | `DATABASE_URL` (api, web) | **pooled** URL with user `slotwise_app`, plus `?sslmode=require&pgbouncer=true&connection_limit=5` |

   `pgbouncer=true` tells Prisma not to use prepared statements, which the pooler can't share.
   Our row-level security works with the pooler because the institute is set with
   `set_config(..., true)`, which lasts only for one transaction (ADR 0002).

### Supabase (alternative)

- Use **Session pooler / direct** (port 5432) for `OWNER_DATABASE_URL` and the
  **Transaction pooler** (port 6543) with `?pgbouncer=true` for `DATABASE_URL`.
- Create `slotwise_app` with the same SQL as above.
- Supabase exposes the `public` schema through its Data API. We don't use it, so turn it off
  (Project settings → Data API) or revoke access from its roles:
  `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;`

### Apply migrations

Migrations always run with the **owner** URL, never `migrate dev` against a hosted database:

```bash
# from the repo root, on your machine (first time) …
OWNER_DATABASE_URL="postgresql://neondb_owner:…@….neon.tech/neondb?sslmode=require" pnpm db:deploy
```

On Windows PowerShell: `$env:OWNER_DATABASE_URL="…"; pnpm db:deploy`.

Later, automate it: add a GitHub Actions job on `main` that runs `pnpm db:deploy` with
`OWNER_DATABASE_URL` stored as an **environment secret** (Settings → Environments →
`production` → secrets, with required reviewers). Keep the owner URL out of the API's
own environment.

### Check the app role is restricted

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'slotwise_app';
-- expect: slotwise_app | f | f
```

The API also checks this at start-up and refuses to run as an unrestricted user.

### First data

- **Staging:** `pnpm db:seed` with the owner URL creates the fictional demo institute.
- **Production:** don't seed demo data. Create the first institute and platform admin with SQL
  (a `db:bootstrap` script is a TODO):
  ```sql
  INSERT INTO institutes (id, name, slug, type, timezone, updated_at)
  VALUES (gen_random_uuid(), '<Institute name>', '<slug>', 'college', 'Asia/Kolkata', now());
  INSERT INTO users (id, email, name, updated_at)
  VALUES (gen_random_uuid(), '<you@example.com>', '<Your name>', now());
  INSERT INTO memberships (id, user_id, role, scope_type)
  SELECT gen_random_uuid(), id, 'platform_admin', 'platform' FROM users WHERE email = '<you@example.com>';
  ```
  Then sign in at `https://<slug>.slotwise.app` and invite that institute's admin from the UI.

Backups: Neon keeps point-in-time history (check your plan's retention). Supabase: enable PITR
or daily backups.

---

## 3. Email (Resend)

1. Add your domain in Resend and create the DNS records it shows (SPF, DKIM). Wait for
   "Verified".
2. Create an API key with sending access.
3. Use it as an SMTP URL in **both** web and api:
   ```
   EMAIL_SERVER=smtp://resend:<RESEND_API_KEY>@smtp.resend.com:587
   EMAIL_FROM=Slotwise <no-reply@slotwise.app>
   ```

---

## 4. API on Railway

1. New project → **Deploy from GitHub repo**.
2. Service **api**:
   - Root directory: `/` (repo root). Builder: **Dockerfile**, path `apps/api/Dockerfile`.
   - Health check path: `/health`.
   - Variables:

     | Variable                     | Value                                           |
     | ---------------------------- | ----------------------------------------------- |
     | `DATABASE_URL`               | pooled `slotwise_app` URL                       |
     | `API_JWT_SECRET`             | 32+ random bytes, **same value as the web app** |
     | `EMAIL_SERVER`, `EMAIL_FROM` | from step 3                                     |
     | `WEB_URL_TEMPLATE`           | `https://{slug}.slotwise.app`                   |
     | `NODE_ENV`                   | `production`                                    |

     Railway sets `PORT`; don't set `API_PORT`.

   - Generate a public domain (e.g. `slotwise-api.up.railway.app`). The web app calls it
     server-to-server; every call carries a signed 5-minute JWT.
3. Service **solver** (optional in Phase 0): root directory `services/solver`, Dockerfile
   `services/solver/Dockerfile`, health check `/health`. Keep it **private** (no public
   domain); the API will call it over Railway's private network in Phase 2.
4. **Redis** (needed from Phase 2): add Railway's Redis and pass `REDIS_URL` to the api.
5. **Timetable PDFs** (Phase 2): the api needs Chromium (e.g. `apt-get install chromium` in its
   image) or `PDF_BROWSER_PATH` pointing at Chrome/Edge; without it PDF downloads answer 503.

Render works the same way: a "Web Service" per Dockerfile, with the same variables.

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

---

## 5. Web app on Vercel

1. **Add New → Project** → import the GitHub repo.
2. Root directory: `apps/web`. Framework: Next.js. Vercel detects pnpm from `packageManager`.
3. Build command: `cd ../.. && pnpm turbo run build --filter=@slotwise/web`
   (this also builds `packages/shared` and `packages/db`, including `prisma generate`).
4. Environment variables:

   | Variable                               | Value                                                              |
   | -------------------------------------- | ------------------------------------------------------------------ |
   | `AUTH_SECRET`                          | random 32+ bytes (`npx auth secret`)                               |
   | `AUTH_TRUST_HOST`                      | `true`                                                             |
   | `DATABASE_URL`                         | pooled `slotwise_app` URL (use `connection_limit=1` on serverless) |
   | `EMAIL_SERVER`, `EMAIL_FROM`           | from step 3                                                        |
   | `API_URL`                              | the Railway API URL, e.g. `https://slotwise-api.up.railway.app`    |
   | `API_JWT_SECRET`                       | same value as the API                                              |
   | `WEB_ROOT_DOMAIN`                      | `slotwise.app` (staging: `staging.slotwise.app`)                   |
   | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | optional, step 6                                                   |

   Do **not** set `AUTH_URL`: sign-in links must follow the institute subdomain.

5. **Domains:** add `slotwise.app` **and** the wildcard `*.slotwise.app`. Wildcards need the
   domain's nameservers pointed at Vercel (Vercel shows the values). Every institute row then
   works at `<slug>.slotwise.app` with no further DNS changes.

---

## 6. Google sign-in (optional)

1. Google Cloud console → APIs & Services → **OAuth consent screen** (External, app name
   "Slotwise").
2. **Credentials → Create OAuth client ID → Web application.**
3. Authorized redirect URIs: one per institute subdomain (Google has no wildcards):
   `https://demo.slotwise.app/api/auth/callback/google`, …
   For local testing add `http://demo.localhost:3000/api/auth/callback/google`; if Google
   rejects it, test Google sign-in on staging and use magic links locally.
4. Put the client id/secret in `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`. The "Continue with
   Google" button appears only when both are set.

A shared sign-in host that removes the per-subdomain list is a follow-up (ADR 0001).

---

## 7. Release checklist

- [ ] CI is green on `main`
- [ ] `pnpm db:deploy` applied with the owner URL; `slotwise_app` is `rolsuper=f, rolbypassrls=f`
- [ ] API `/health` returns `{"status":"ok","database":"ok"}` and its log says
      `Connected as restricted role "slotwise_app"`
- [ ] `API_JWT_SECRET` is identical in web and api; `AUTH_SECRET` is set; no dev secrets reused
- [ ] Resend domain verified; a sign-in email arrives
- [ ] `https://<slug>.slotwise.app` loads; another institute's subdomain shows "You don't have
      access" for your account
- [ ] Owner database URL is only in GitHub environment secrets / your password manager
