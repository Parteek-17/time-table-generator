#!/usr/bin/env node
// Creates a git worktree for a stream next to the main checkout, on a branch from origin/main:
//
//   node scripts/new-worktree.mjs P2T views     → ../slotwise-p2t on branch p2t/views
//
// Then copies the three .env files from the main worktree (contents never printed), writes the
// stream's .env.local overrides (stream-env.mjs) and runs pnpm install.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { streamConfig } from './lib/streams.mjs';

const [streamArg, slug] = process.argv.slice(2);
if (!streamArg || !slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  console.error(
    'Usage: node scripts/new-worktree.mjs <STREAM> <slug>   (slug in lower case, e.g. views)',
  );
  process.exit(1);
}
let config;
try {
  config = streamConfig(streamArg);
} catch (error) {
  console.error(`new-worktree: ${error.message}`);
  process.exit(1);
}
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

// The main worktree is the first one git lists.
const here = git(['rev-parse', '--show-toplevel'], process.cwd());
const main = git(['worktree', 'list', '--porcelain'], here)
  .split('\n')[0]
  .replace(/^worktree /, '');
const target = resolve(dirname(main), `slotwise-${config.id.toLowerCase()}`);
const branch = `${config.branch}/${slug}`;

if (existsSync(target)) {
  console.error(
    `new-worktree: ${target} already exists. Use it, or remove it with "git worktree remove".`,
  );
  process.exit(1);
}

git(['fetch', 'origin'], main);
const branchExists =
  spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: main })
    .status === 0;
git(
  branchExists
    ? ['worktree', 'add', target, branch]
    : ['worktree', 'add', '-b', branch, target, 'origin/main'],
  main,
);
console.log(
  `worktree ${target} on ${branch}${branchExists ? ' (existing branch)' : ' from origin/main'}`,
);

for (const file of ['apps/api/.env', 'apps/web/.env', 'packages/db/.env']) {
  if (existsSync(join(main, file))) {
    copyFileSync(join(main, file), join(target, file));
    console.log(`copied ${file}`);
  } else {
    console.warn(`skipped ${file} (missing in ${main}; pnpm install creates it from .env.example)`);
  }
}

const run = (cmd, args) => {
  const result = spawnSync(cmd, args, {
    cwd: target,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run('node', ['scripts/stream-env.mjs', config.id]);
run('pnpm', ['install']);

console.log(`\nReady: ${target}. Open it in its own Claude Code chat.`);
