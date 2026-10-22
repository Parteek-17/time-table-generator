import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** API_PORT wins over PORT so a PORT meant for the web app (e.g. in `pnpm dev`) is ignored. */
  API_PORT: z.coerce.number().int().positive().optional(),
  /** Set by Railway/Render in production. */
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  API_JWT_SECRET: z.string().min(32, 'API_JWT_SECRET must be at least 32 characters'),
  EMAIL_SERVER: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  WEB_URL_TEMPLATE: z.string().includes('{slug}').default('http://{slug}.localhost:3000'),
  INVITE_TTL_DAYS: z.coerce.number().int().positive().default(7),
  /** BullMQ (apps/api/src/queue). The path picks the Redis database, e.g. redis://host:6379/3. */
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  /** Python solver (services/solver). Called from jobs only, never inside a request. */
  SOLVER_URL: z.string().url().default('http://localhost:8000'),
  /** S3-compatible storage for imports and generated PDFs. Local dev: MinIO (docker compose). */
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** MinIO needs path-style URLs (http://host:9000/bucket/key). */
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false', '1', '0'])
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
});

export type Env = z.infer<typeof envSchema>;
export const ENV = Symbol('ENV');

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid API environment (see apps/api/.env.example):\n${problems.join('\n')}`);
  }
  return parsed.data;
}

/** Loads apps/api/.env if present. Real environment variables win. */
export function loadDotEnv(): void {
  try {
    process.loadEnvFile('.env');
  } catch {
    // No .env file (production, CI): use the real environment.
  }
}
