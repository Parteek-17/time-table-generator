# Evaluation deploy: everything on Railway

One Railway project runs the whole app for an evaluation: **web**, **api**, **solver**, **Postgres**
and **Redis**. The web app serves the fictional Demo Institute on its plain Railway address
(`SINGLE_INSTITUTE_SLUG=demo`), and judges sign in with one click at `/demo-login`
(`DEMO_LOGINS=true`). For real colleges (one subdomain each, real email), follow
`docs/deployment.md` instead.

Time: about 45 minutes, most of it waiting for builds.

## 1. Create the project and the data services

1. Sign in at railway.com with GitHub. **New Project → Deploy from GitHub repo →**
   `time-table-generator`. Cancel the first automatic deploy; you'll set it up as **api** below.
2. In the project: **+ New → Database → PostgreSQL**. Then **+ New → Database → Redis**.

## 2. Prepare the database (from your laptop, once)

In the Postgres service → **Variables**, copy `DATABASE_PUBLIC_URL` (the owner login). Then, from
the repository root in Git Bash:

```bash
export OWNER_DATABASE_URL="<DATABASE_PUBLIC_URL>"
```

Create the restricted app login the API and web use (row-level security applies to it). Pick a
long random password and keep it for step 3:

```bash
psql "$OWNER_DATABASE_URL" -c "CREATE ROLE slotwise_app LOGIN PASSWORD '<app password>' NOSUPERUSER NOBYPASSRLS;"
```

No `psql` on your machine? Use the Postgres service's **Data → Query** tab and run the same
`CREATE ROLE` statement there.

Apply the migrations and load the demo institute:

```bash
pnpm db:deploy
pnpm db:seed
```

The app's connection URL is the owner URL with the app login swapped in:
`postgresql://slotwise_app:<app password>@<host>:<port>/<database>`. Call it `APP_DATABASE_URL`.

## 3. Services

Every service below: **Settings → Source**: this repo, branch `main`; **Builder: Dockerfile**.
Generate the shared secrets once on your machine:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Run it twice: one value is `API_JWT_SECRET`, the other `AUTH_SECRET`.

### solver

- Root directory `services/solver`, Dockerfile path `Dockerfile`.
- No public domain needed (the API reaches it on Railway's private network).

### api

- Root directory `/`, Dockerfile path `apps/api/Dockerfile`.
- **Settings → Networking → Generate Domain** (the web app calls it server-side; a public
  domain also lets you check `https://<api domain>/health`).
- Variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `APP_DATABASE_URL` from step 2 |
| `API_JWT_SECRET` | the first secret |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `SOLVER_URL` | `http://${{solver.RAILWAY_PRIVATE_DOMAIN}}:${{solver.PORT}}` |
| `SNAPSHOT_SOURCE` / `SOLVER_SOURCE` / `RESCHEDULE_SOURCE` | `api` / `http` / `api` |
| `EMAIL_SERVER` / `EMAIL_FROM` | an SMTP URL (Resend: `smtps://resend:<key>@smtp.resend.com:465`) and `Slotwise <no-reply@your-domain>`. Without one, demo sign-in still works; invites and email links don't. |
| `WEB_URL_TEMPLATE` | `https://<web domain>/?institute={slug}` |
| `ANTHROPIC_API_KEY` | your key, for "Ask Slotwise" (leave unset to hide the chat) |
| `FLAG_UI`, `FLAG_P2T`, `FLAG_P4`, `FLAG_P5`, `FLAG_P6`, `FLAG_P7` | `1` each. **In production every flag is off unless set.** |

### web

- Root directory `/`, Dockerfile path `apps/web/Dockerfile`.
- **Generate Domain**, e.g. `slotwise-demo.up.railway.app`: the judges' address.
- Variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `APP_DATABASE_URL` |
| `API_URL` | `https://<api domain>` |
| `API_JWT_SECRET` | the same first secret as the api |
| `AUTH_SECRET` | the second secret |
| `AUTH_TRUST_HOST` | `true` |
| `WEB_ROOT_DOMAIN` | the web domain, e.g. `slotwise-demo.up.railway.app` |
| `SINGLE_INSTITUTE_SLUG` | `demo` |
| `DEMO_LOGINS` | `true` (evaluation only, never with real users) |
| `EMAIL_SERVER` / `EMAIL_FROM` | same as the api |
| `FLAG_UI` … `FLAG_P7` | `1` each, as on the api |

## 4. Check it

1. `https://<api domain>/health` answers `ok`.
2. Open `https://<web domain>/demo-login`, sign in as **Timetable coordinator**, open
   **Generate**, generate, open the draft and publish it. The real solver runs on Railway, so
   the published timetable belongs to the seeded sections and students see their classes.
3. Sign in as **Student**: Today shows the day's classes.
4. As the coordinator, open **Ask Slotwise** and ask "Which classes does CS B have on Monday?".

The platform admin's pages need the main site, which this single-address setup doesn't have;
show them locally if needed.

## 5. After the evaluation

Set `DEMO_LOGINS=false` (or delete the project). Never leave demo sign-in on where real people
have accounts.
