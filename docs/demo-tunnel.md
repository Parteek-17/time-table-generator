# Live demo from your laptop with a Cloudflare tunnel (free)

Runs the whole app on this laptop and gives it a public `https://…trycloudflare.com` address
that judges can open on their own phones or laptops. Free, no account. The laptop must stay on
and online for the whole evaluation.

## Once

In `apps/web/.env` (local only, never committed):

```
DEMO_LOGINS="true"
SINGLE_INSTITUTE_SLUG="demo"
```

`SINGLE_INSTITUTE_SLUG` makes a plain address (the tunnel's, or `localhost:3000`) serve the
Demo Institute. Remove it afterwards: with it set, the platform admin's main site isn't
reachable locally.

For the chatbot, put your key in `apps/api/.env`: `ANTHROPIC_API_KEY="…"`.

## Each time (about 10 minutes)

Close Chrome tabs and other heavy apps first (8 GB laptop). In separate terminals, from the
repository root:

1. Start Docker Desktop, then the database, Redis and Mailpit:

   ```bash
   docker compose up -d
   ```

2. The solver. Port 8000 is used by another project on this laptop, so it runs on 8011
   (`SOLVER_URL="http://localhost:8011"` in `apps/api/.env`):

   ```bash
   cd services/solver && python -m uv run uvicorn slotwise_solver.main:app --port 8011
   ```

3. Web and API:

   ```bash
   pnpm dev
   ```

   Wait for `API listening on http://localhost:4000`, then open `http://localhost:3000` once so
   the first pages compile before judges arrive.

4. The tunnel:

   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

   It prints `https://<random-words>.trycloudflare.com`. That is the address for the judges; it
   changes every time you start the tunnel.

5. Warm up: open `https://<…>.trycloudflare.com/demo-login`, sign in as each role you'll show
   and open its main pages once. The first visit to each page compiles it (10–30 s); after that
   they're fast.

## Give the judges

`https://<…>.trycloudflare.com/demo-login`: one click per role (see the revision sheet's
login table).

## Afterwards

Stop the tunnel (Ctrl+C) and set `DEMO_LOGINS="false"`.
