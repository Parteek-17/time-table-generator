// Pure helpers for scripts/check-ownership.mjs (tested in ownership.test.mjs).
// Parses docs/coordination/OWNERSHIP.md and decides, per changed path, whether a stream may
// edit it. No git or file-system access here.

/** Lower-case ADR number ranges per stream (inclusive). INT: 0100 and up. */
export const ADR_RANGES = {
  P1: [10, 29],
  UI: [30, 39],
  P2E: [40, 49],
  P2T: [50, 59],
  P4: [60, 69],
  P5: [70, 79],
  P6: [80, 89],
  P7: [90, 99],
  INT: [100, 9999],
};

/** Packages whose package.json dependencies a stream may change if it owns files inside. */
const NODE_PACKAGES = ['apps/web', 'apps/api', 'packages/db', 'packages/shared', 'packages/ui'];
const SOLVER = 'services/solver';

/** Reads every ```ownership block: { stream, branches: string[], paths: string[] }. */
export function parseOwnership(markdown) {
  const streams = [];
  const blocks = markdown.matchAll(/```ownership\r?\n([\s\S]*?)```/g);
  for (const [, body] of blocks) {
    const entry = { stream: '', branches: [], paths: [] };
    let section = null;
    for (const raw of body.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const stream = /^stream:\s*(\S+)$/.exec(line);
      if (stream) entry.stream = stream[1];
      else if (line === 'branches:') section = 'branches';
      else if (line === 'paths:') section = 'paths';
      else if (section) entry[section].push(line);
      else throw new Error(`OWNERSHIP.md: unexpected line "${line}"`);
    }
    if (!entry.stream) throw new Error('OWNERSHIP.md: an ownership block has no "stream:" line');
    streams.push(entry);
  }
  return streams;
}

/** Expands {a,b} alternatives (nested allowed) into plain globs. */
export function expandBraces(pattern) {
  const open = pattern.indexOf('{');
  if (open === -1) return [pattern];
  let depth = 0;
  let close = -1;
  const parts = [];
  let start = open + 1;
  for (let i = open; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      close = i;
      parts.push(pattern.slice(start, i));
      break;
    } else if (c === ',' && depth === 1) {
      parts.push(pattern.slice(start, i));
      start = i + 1;
    }
  }
  if (close === -1) throw new Error(`Unbalanced braces in "${pattern}"`);
  const head = pattern.slice(0, open);
  const tail = pattern.slice(close + 1);
  return parts.flatMap((p) => expandBraces(head + p + tail));
}

/** Glob → RegExp. `**` spans segments, `*` stays inside one segment. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      // "dir/**" matches everything below dir; "**/x" matches x at any depth.
      if (glob[i + 2] === '/') {
        re += '(?:.*/)?';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function matcher(globs) {
  const regexps = globs.flatMap(expandBraces).map(globToRegExp);
  return (path) => regexps.some((r) => r.test(path));
}

/** Branch name → stream entry, or null. */
export function streamForBranch(streams, branch) {
  for (const s of streams) if (matcher(s.branches)(branch)) return s;
  return null;
}

/** Paths every stream may edit in addition to its own list. */
export function commonGlobs(stream) {
  const lower = stream.toLowerCase();
  return [
    `apps/web/src/registry/nav/${lower}.ts`,
    `apps/api/src/registry/modules/${lower}.ts`,
    `docs/coordination/status/${stream}.md`,
    `docs/coordination/claude-md-proposals/${stream}.md`,
  ];
}

export function isOwnAdr(stream, path) {
  const m = /^docs\/adr\/(\d{4})-[^/]+\.md$/.exec(path);
  if (!m) return false;
  const [lo, hi] = ADR_RANGES[stream] ?? [-1, -1];
  const n = Number(m[1]);
  return n >= lo && n <= hi;
}

/** Packages (by folder) in which the stream owns at least one path. */
export function ownedPackages(entry) {
  const globs = entry.paths.flatMap(expandBraces);
  return [...NODE_PACKAGES, SOLVER].filter((pkg) =>
    globs.some((g) => g === '**' || g.startsWith(`${pkg}/`)),
  );
}

const DEP_KEYS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

/** True when two package.json texts differ only in dependency maps. */
export function onlyDependenciesChanged(before, after) {
  const strip = (text) => {
    const json = JSON.parse(text);
    for (const k of DEP_KEYS) delete json[k];
    return JSON.stringify(json);
  };
  return strip(before) === strip(after);
}

/** Model names declared in a .prisma file. */
export function prismaModels(text) {
  return [...text.matchAll(/^\s*model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
}

const BACK_RELATION =
  /^\s*\w+\s+(\w+)(?:\[\]|\?)\s*(?:@relation\(\s*(?:name:\s*)?"[^"]*"\s*\))?\s*(?:\/\/.*)?$/;

/**
 * Checks the +/- lines of a unified diff of another stream's .prisma file: each must be blank
 * or a bare back-relation field whose type is one of `ownModels`. Returns offending lines.
 */
export function badPrismaLines(diffText, ownModels) {
  const bad = [];
  for (const line of diffText.split(/\r?\n/)) {
    if (!/^[+-]/.test(line) || /^(\+\+\+|---) /.test(line)) continue;
    const body = line.slice(1);
    if (body.trim() === '') continue;
    const m = BACK_RELATION.exec(body);
    if (!m || !ownModels.includes(m[1])) bad.push(line);
  }
  return bad;
}

/**
 * Classifies changed files. `changes` = [{ status: 'A'|'M'|'D'|'R', path, oldPath? }].
 * `ctx` supplies lazy readers for the special cases:
 *   packageJson(path) → { before, after } texts (null when absent)
 *   prismaDiff(path) → unified diff text; ownModels → model names in the stream's schema files.
 * Returns { allowed: string[], denied: { path, reason }[] }.
 */
export function classify(entry, changes, ctx) {
  const allowed = [];
  const denied = [];
  const own = matcher([...entry.paths, ...commonGlobs(entry.stream)]);
  const packages = ownedPackages(entry);
  const changedOwnDeps = new Set();

  const check = (path, status) => {
    if (own(path) || isOwnAdr(entry.stream, path)) return null;
    const requests = 'docs/coordination/requests/';
    if (path.startsWith(requests) && !path.slice(requests.length).includes('/')) {
      return status === 'A' ? null : 'existing request files are edited by INT only';
    }
    const pkg = /^(.*)\/package\.json$/.exec(path)?.[1];
    if (pkg && packages.includes(pkg) && status === 'M') {
      const { before, after } = ctx.packageJson(path);
      if (before && after && onlyDependenciesChanged(before, after)) {
        changedOwnDeps.add(pkg);
        return null;
      }
      return 'only dependency changes are allowed in this package.json';
    }
    if (packages.includes(SOLVER) && path === `${SOLVER}/pyproject.toml`) {
      changedOwnDeps.add(SOLVER);
      return null;
    }
    if (/^packages\/db\/prisma\/schema\/[^/]+\.prisma$/.test(path) && status === 'M') {
      const bad = badPrismaLines(ctx.prismaDiff(path), ctx.ownModels);
      if (bad.length === 0) return null;
      return `only back-relation fields to your own models are allowed here:\n      ${bad.join('\n      ')}`;
    }
    return 'outside this stream';
  };

  const lockfiles = [];
  for (const c of changes) {
    const paths = c.status === 'R' ? [c.oldPath, c.path] : [c.path];
    for (const p of paths) {
      if (p === 'pnpm-lock.yaml' || p === `${SOLVER}/uv.lock`) {
        lockfiles.push(p);
        continue;
      }
      const reason = check(p, c.status === 'R' ? (p === c.path ? 'A' : 'D') : c.status);
      if (reason) denied.push({ path: p, reason });
      else allowed.push(p);
    }
  }
  for (const p of lockfiles) {
    const ok =
      p === 'pnpm-lock.yaml'
        ? [...changedOwnDeps].some((x) => x !== SOLVER)
        : changedOwnDeps.has(SOLVER);
    if (ok || own(p)) allowed.push(p);
    else denied.push({ path: p, reason: 'lockfile changed without a dependency change you own' });
  }
  return { allowed, denied };
}
