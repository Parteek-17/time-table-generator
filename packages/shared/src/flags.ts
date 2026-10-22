/**
 * Feature flags, one per stream (docs/coordination/OWNERSHIP.md). A stream's screens, routes
 * and jobs stay behind its flag until INT turns it on in production.
 *
 * Read from the environment: `FLAG_P2T=1` (or `true`) turns a flag on, `FLAG_P2T=0` (or
 * `false`) turns it off. Unset: on in development and test, off in production.
 * P1 is already live and has no flag; P2E is the solver, which the API reaches through P2T.
 */
export const FLAGS = ['UI', 'P2T', 'P4', 'P5', 'P6', 'P7'] as const;
export type Flag = (typeof FLAGS)[number];

type EnvSource = Readonly<Record<string, string | undefined>>;

export function isFlagOn(flag: Flag, env: EnvSource = process.env): boolean {
  const value = env[`FLAG_${flag}`]?.trim().toLowerCase();
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return env.NODE_ENV !== 'production';
}

/** Every flag with its current value (for diagnostics and the dev UI gallery). */
export function flagStates(env: EnvSource = process.env): Record<Flag, boolean> {
  return Object.fromEntries(FLAGS.map((f) => [f, isFlagOn(f, env)])) as Record<Flag, boolean>;
}
