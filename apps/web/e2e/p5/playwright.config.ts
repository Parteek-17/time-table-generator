/**
 * P5's browser tests (student and teacher portals). Needs the dev servers, Postgres and Mailpit running and the
 * demo institute seeded:
 *
 *   pnpm --filter @slotwise/web exec playwright test -c e2e/p5
 *
 * In a stream worktree, point it at the stream's port, e.g.
 * E2E_BASE_URL=http://demo.localhost:3001. Uses the installed Microsoft Edge, so no browser
 * download is needed.
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  // Traces and screenshots of failed runs, in a folder git already ignores.
  outputDir: '../../node_modules/.cache/e2e-p5',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://demo.localhost:3000',
    channel: 'msedge',
    // Phone width: students and staff mostly use the app on phones (CLAUDE.md).
    viewport: { width: 400, height: 850 },
    trace: 'retain-on-failure',
  },
});
