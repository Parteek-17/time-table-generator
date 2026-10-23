#!/usr/bin/env node
// Fails when the current branch changes files outside its stream (docs/coordination/OWNERSHIP.md).
//
//   pnpm check:ownership                      branch from git, base origin/main
//   node scripts/check-ownership.mjs --branch p2t/views --base origin/main
//   node scripts/check-ownership.mjs --stream P2T     ignore the branch name
//
// Compares the merge base with origin/main against the working tree, so uncommitted and
// untracked files count too (run it before every commit).
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { classify, parseOwnership, prismaModels, streamForBranch } from './lib/ownership.mjs';

const root = join(import.meta.dirname, '..');
const git = (...args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const { values } = parseArgs({
  options: {
    branch: { type: 'string' },
    base: {
      type: 'string',
      default: process.env.GITHUB_BASE_REF
        ? `origin/${process.env.GITHUB_BASE_REF}`
        : 'origin/main',
    },
    stream: { type: 'string' },
  },
});

const streams = parseOwnership(readFileSync(join(root, 'docs/coordination/OWNERSHIP.md'), 'utf8'));
const branch =
  values.branch ?? process.env.GITHUB_HEAD_REF ?? git('rev-parse', '--abbrev-ref', 'HEAD').trim();

let entry;
if (values.stream) {
  entry = streams.find((s) => s.stream === values.stream.toUpperCase());
  if (!entry)
    fail(`Unknown stream "${values.stream}". Known: ${streams.map((s) => s.stream).join(', ')}`);
} else {
  if (branch === 'main' || branch === 'HEAD') {
    console.log(`check:ownership: on "${branch}", nothing to check (only INT merges to main).`);
    process.exit(0);
  }
  entry = streamForBranch(streams, branch);
  if (!entry)
    fail(
      `Branch "${branch}" does not start with a stream prefix (p1/, ui/, p2e/, p2t/, p4/, p5/, p6/, p7/, int/, c0/ or feat/phase1-).\n` +
        'Rename it (git branch -m <stream>/<slug>) or pass --stream <ID>.',
    );
}

let base;
try {
  base = git('merge-base', values.base, 'HEAD').trim();
} catch {
  fail(`Cannot find "${values.base}". Run "git fetch origin" first.`);
}

const changes = [];
for (const line of git('diff', '--name-status', '-M', base).split('\n')) {
  if (!line.trim()) continue;
  const [status, a, b] = line.split('\t');
  if (status.startsWith('R')) changes.push({ status: 'R', oldPath: a, path: b });
  else changes.push({ status: status[0], path: a });
}
for (const path of git('ls-files', '--others', '--exclude-standard').split('\n')) {
  if (path.trim()) changes.push({ status: 'A', path: path.trim() });
}

const show = (ref, path) => {
  try {
    return git('show', `${ref}:${path}`);
  } catch {
    return null;
  }
};
const workingTree = (path) =>
  existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : null;

// Models declared in this stream's own schema files (before and after the change).
const ownSchemaFiles = changes
  .map((c) => c.path)
  .concat(git('ls-files', 'packages/db/prisma/schema').split('\n'))
  .filter((p) => /^packages\/db\/prisma\/schema\/[^/]+\.prisma$/.test(p));
const ownModels = [];
for (const p of new Set(ownSchemaFiles)) {
  const owns = classify(entry, [{ status: 'A', path: p }], {}).denied.length === 0;
  if (!owns) continue;
  for (const text of [show(base, p), workingTree(p)])
    if (text) ownModels.push(...prismaModels(text));
}

const { allowed, denied } = classify(entry, changes, {
  packageJson: (path) => ({ before: show(base, path), after: workingTree(path) }),
  prismaDiff: (path) => git('diff', '-U0', base, '--', path),
  ownModels,
});

console.log(
  `check:ownership: branch "${branch}" → stream ${entry.stream}, ${allowed.length} file(s) OK.`,
);
if (denied.length > 0) {
  console.error(`\n${denied.length} file(s) are outside stream ${entry.stream}:`);
  for (const d of denied) console.error(`  ✗ ${d.path}\n      ${d.reason}`);
  console.error(
    '\nUndo these changes, or file a request in docs/coordination/requests/ (see its README).',
  );
  process.exit(1);
}

function fail(message) {
  console.error(`check:ownership: ${message}`);
  process.exit(1);
}
