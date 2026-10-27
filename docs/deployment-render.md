# Evaluation deploy on Render (free plans)

`render.yaml` creates everything in one go: **slotwise-web**, **slotwise-api**,
**slotwise-solver**, a free Postgres (**slotwise-db**) and a free Redis (**slotwise-redis**).
The web app serves the fictional Demo Institute on its plain Render address and judges sign in
with one click at `/demo-login`.

**Free-plan limits to plan around:** web services sleep after 15 minutes without visits and
take about a minute to wake; each has 512 MB of memory (PDF downloads are the heaviest part);
the free database expires after 30 days. Sign-in emails aren't sent (no email service is set
up); demo sign-in doesn't need them.

## 1. Push and create the Blueprint

1. Push `main` to GitHub.
2. render.com → sign in with GitHub → **New → Blueprint** → choose this repository → **Apply**.
   Render asks for the `sync: false` values; for now enter a placeholder (`x`) in each and
   finish them in step 3, because some depend on addresses that don't exist yet.

The first builds take 10–20 minutes. Addresses will be
`https://slotwise-web.onrender.com`, `https://slotwise-api.onrender.com` and
`https://slotwise-solver.onrender.com` (Render adds a suffix if a name is taken; use what the
dashboard shows).

## 2. Prepare the database (from your laptop, once)

In **slotwise-db → Info**, copy the **External Database URL** (the owner login). From the
repository root in Git Bash:

```bash
export OWNER_DATABASE_URL="<External Database URL>"
psql "$OWNER_DATABASE_URL" -c "CREATE ROLE slotwise_app LOGIN PASSWORD '<long random password>' NOSUPERUSER NOBYPASSRLS;"
pnpm db:deploy
pnpm db:seed
```

The app's database URL is the **Internal Database URL** with the user and password swapped for
`slotwise_app` and its password: `postgresql://slotwise_app:<password>@<internal host>/<database>`.
No `psql`? Run the `CREATE ROLE` line from any Postgres client connected with the external URL.

Generate one shared secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## 3. Fill in the values

**slotwise-api → Environment:**

| Variable            | Value                                                 |
| ------------------- | ----------------------------------------------------- |
| `DATABASE_URL`      | the `slotwise_app` URL from step 2                    |
| `API_JWT_SECRET`    | the secret                                            |
| `SOLVER_URL`        | `https://slotwise-solver.onrender.com`                |
| `WEB_URL_TEMPLATE`  | `https://slotwise-web.onrender.com/?institute={slug}` |
| `ANTHROPIC_API_KEY` | your key, or leave empty                              |

**slotwise-web → Environment:**

| Variable          | Value                               |
| ----------------- | ----------------------------------- |
| `DATABASE_URL`    | the same `slotwise_app` URL         |
| `API_URL`         | `https://slotwise-api.onrender.com` |
| `API_JWT_SECRET`  | the same secret as the api          |
| `WEB_ROOT_DOMAIN` | `slotwise-web.onrender.com`         |

Saving redeploys each service.

## 4. Before the judges arrive

Free services are asleep. About 5 minutes before, open in this order and wait for each:

1. `https://slotwise-solver.onrender.com/health`
2. `https://slotwise-api.onrender.com/health`
3. `https://slotwise-web.onrender.com/demo-login`

Then sign in as **Timetable coordinator**, **Generate**, open the draft and **Publish**, so the
timetable belongs to the seeded sections and students see their classes. Sign in as
**Student** to check Today.

Give the judges `https://slotwise-web.onrender.com/demo-login`.

## 5. After the evaluation

Set `DEMO_LOGINS` to `false` on slotwise-web, or delete the Blueprint's services.
