import 'server-only';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  EMAIL_SERVER: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  API_URL: z.url(),
  API_JWT_SECRET: z.string().min(32),
  WEB_ROOT_DOMAIN: z.string().min(1).default('localhost'),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
});

let cached: z.infer<typeof schema> | undefined;

/** Server-only environment, validated on first use (not at build time). */
export function env(): z.infer<typeof schema> {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid web environment (see apps/web/.env.example):\n${problems.join('\n')}`);
  }
  cached = parsed.data;
  return cached;
}

export function googleSignInEnabled(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}
