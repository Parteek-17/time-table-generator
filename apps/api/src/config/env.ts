import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  API_JWT_SECRET: z.string().min(32, 'API_JWT_SECRET must be at least 32 characters'),
  EMAIL_SERVER: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  WEB_URL_TEMPLATE: z.string().includes('{slug}').default('http://{slug}.localhost:3000'),
  INVITE_TTL_DAYS: z.coerce.number().int().positive().default(7),
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
