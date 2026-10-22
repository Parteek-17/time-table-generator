// Local ports, databases and Redis databases per stream, so worktrees run side by side
// (docs/coordination/OWNERSHIP.md). null = the stream does not run that service.

export const STREAMS = {
  INT: { web: 3000, api: 4000, solver: 8000, db: 'slotwise', redis: 0, branch: 'int' },
  P1: { web: 3001, api: 4001, solver: 8001, db: 'slotwise_p1', redis: 1, branch: 'p1' },
  UI: { web: 3009, api: 4009, solver: null, db: 'slotwise_ui', redis: 9, branch: 'ui' },
  P2E: { web: null, api: null, solver: 8002, db: null, redis: null, branch: 'p2e' },
  P2T: { web: 3003, api: 4003, solver: 8003, db: 'slotwise_p2t', redis: 3, branch: 'p2t' },
  P4: { web: 3004, api: 4004, solver: 8004, db: 'slotwise_p4', redis: 4, branch: 'p4' },
  P5: { web: 3005, api: 4005, solver: 8005, db: 'slotwise_p5', redis: 5, branch: 'p5' },
  P6: { web: 3006, api: 4006, solver: 8006, db: 'slotwise_p6', redis: 6, branch: 'p6' },
  P7: { web: 3007, api: 4007, solver: 8007, db: 'slotwise_p7', redis: 7, branch: 'p7' },
};

/** Stream databases other than the main one (for creating them). */
export const STREAM_DATABASES = Object.values(STREAMS)
  .map((s) => s.db)
  .filter((db) => db && db !== 'slotwise');

export function streamConfig(id) {
  const key = String(id ?? '').toUpperCase();
  const config = STREAMS[key];
  if (!config) {
    throw new Error(`Unknown stream "${id}". Use one of: ${Object.keys(STREAMS).join(', ')}`);
  }
  return { id: key, ...config };
}

/** Same URL with another database name (keeps user, password, host, port, query). */
export function withDatabase(url, db) {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

/** Same Redis URL with another database index. */
export function withRedisDb(url, index) {
  const u = new URL(url);
  u.pathname = `/${index}`;
  return u.toString();
}

/** Parses KEY=value lines of a .env file (values may be quoted). Comments are skipped. */
export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    let value = m[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    out[m[1]] = value;
  }
  return out;
}

/**
 * The .env.local files for a stream, given the worktree's existing .env values
 * (`{ 'apps/api/.env': { KEY: value } }`). Returns `{ path: { comments, values } }` for the
 * apps the stream runs.
 */
export function streamEnvFiles(config, env) {
  const files = {};
  const header = `Written by scripts/stream-env.mjs for stream ${config.id}; overrides .env.`;
  const pick = (entries) => Object.fromEntries(entries.filter(([, v]) => v != null));
  if (config.api) {
    const api = env['apps/api/.env'] ?? {};
    files['apps/api/.env.local'] = {
      comments: [header],
      values: pick([
        ['API_PORT', String(config.api)],
        ['DATABASE_URL', api.DATABASE_URL && withDatabase(api.DATABASE_URL, config.db)],
        [
          'TEST_OWNER_DATABASE_URL',
          api.TEST_OWNER_DATABASE_URL && withDatabase(api.TEST_OWNER_DATABASE_URL, config.db),
        ],
        ['REDIS_URL', withRedisDb(api.REDIS_URL || 'redis://localhost:6379', config.redis)],
        ['SOLVER_URL', config.solver ? `http://localhost:${config.solver}` : null],
        ['WEB_URL_TEMPLATE', `http://{slug}.localhost:${config.web}`],
      ]),
    };
  }
  if (config.web) {
    const web = env['apps/web/.env'] ?? {};
    files['apps/web/.env.local'] = {
      comments: [
        header,
        `Auth.js follows the request host (AUTH_TRUST_HOST), so sign in on http://demo.localhost:${config.web}.`,
        `Google OAuth redirect URI for this port: http://demo.localhost:${config.web}/api/auth/callback/google`,
      ],
      values: pick([
        ['WEB_PORT', String(config.web)],
        ['API_URL', `http://localhost:${config.api}`],
        ['DATABASE_URL', web.DATABASE_URL && withDatabase(web.DATABASE_URL, config.db)],
      ]),
    };
  }
  if (config.db) {
    const db = env['packages/db/.env'] ?? {};
    files['packages/db/.env.local'] = {
      comments: [header],
      values: pick([
        [
          'OWNER_DATABASE_URL',
          db.OWNER_DATABASE_URL && withDatabase(db.OWNER_DATABASE_URL, config.db),
        ],
        ['APP_DATABASE_URL', db.APP_DATABASE_URL && withDatabase(db.APP_DATABASE_URL, config.db)],
      ]),
    };
  }
  if (config.solver) {
    files['services/solver/.env.local'] = {
      comments: [
        header,
        `Start the solver with: uv run uvicorn slotwise_solver.main:app --reload --port ${config.solver}`,
      ],
      values: { SOLVER_PORT: String(config.solver) },
    };
  }
  return files;
}

export function renderEnv({ comments, values }) {
  const lines = comments.map((c) => `# ${c}`);
  for (const [key, value] of Object.entries(values)) lines.push(`${key}="${value}"`);
  return `${lines.join('\n')}\n`;
}
