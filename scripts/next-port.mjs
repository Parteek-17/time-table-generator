#!/usr/bin/env node
// Runs `next <dev|start>` on WEB_PORT from apps/web/.env.local (written by stream-env.mjs in a
// stream worktree), else 3000. Next picks its port before it reads .env files, so the port is
// passed on the command line. Run from apps/web (its dev and start scripts do).
import { spawn } from 'node:child_process';

try {
  process.loadEnvFile('.env.local');
} catch {
  // Main worktree: default port.
}
const [command = 'dev', ...rest] = process.argv.slice(2);
const port = process.env.WEB_PORT ?? '3000';
const child = spawn('next', [command, '--port', port, ...rest], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 1));
