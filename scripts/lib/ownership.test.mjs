import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  badPrismaLines,
  classify,
  expandBraces,
  matcher,
  onlyDependenciesChanged,
  parseOwnership,
  streamForBranch,
} from './ownership.mjs';

const streams = parseOwnership(
  readFileSync(join(import.meta.dirname, '../../docs/coordination/OWNERSHIP.md'), 'utf8'),
);
const get = (id) => streams.find((s) => s.stream === id);
const noCtx = { packageJson: () => ({}), prismaDiff: () => '', ownModels: [] };

describe('OWNERSHIP.md', () => {
  it('has every stream', () => {
    assert.deepEqual(streams.map((s) => s.stream).sort(), [
      'INT',
      'P1',
      'P2E',
      'P2T',
      'P4',
      'P5',
      'P6',
      'P7',
      'UI',
    ]);
  });

  it('maps branches to streams', () => {
    const of = (b) => streamForBranch(streams, b)?.stream ?? null;
    assert.equal(of('feat/phase1-wizard'), 'P1');
    assert.equal(of('p1/imports'), 'P1');
    assert.equal(of('p2t/views'), 'P2T');
    assert.equal(of('p2e/cpsat'), 'P2E');
    assert.equal(of('c0/contracts'), 'INT');
    assert.equal(of('int/merge-p2t'), 'INT');
    assert.equal(of('feature/x'), null);
  });
});

describe('globs', () => {
  it('expands nested braces', () => {
    assert.deepEqual(expandBraces('a/{b,c/{d,e}}/f'), ['a/b/f', 'a/c/d/f', 'a/c/e/f']);
  });

  it('treats route-group parentheses literally and ** as any depth', () => {
    const m = matcher(['apps/web/src/app/(app)/timetable/**']);
    assert.ok(m('apps/web/src/app/(app)/timetable/page.tsx'));
    assert.ok(m('apps/web/src/app/(app)/timetable/[id]/edit/page.tsx'));
    assert.ok(!m('apps/web/src/app/app/timetable/page.tsx'));
    assert.ok(!m('apps/web/src/app/(app)/timetables/page.tsx'));
  });

  it('keeps * inside one segment', () => {
    const m = matcher(['apps/web/src/components/term-picker*']);
    assert.ok(m('apps/web/src/components/term-picker.tsx'));
    assert.ok(!m('apps/web/src/components/term-picker/x.tsx'));
  });
});

describe('classify', () => {
  it('allows own paths, common files and ADRs in range', () => {
    const { denied } = classify(
      get('P2T'),
      [
        { status: 'A', path: 'apps/api/src/timetable/timetable.module.ts' },
        { status: 'M', path: 'apps/api/src/registry/modules/p2t.ts' },
        { status: 'M', path: 'apps/web/src/registry/nav/p2t.ts' },
        { status: 'M', path: 'docs/coordination/status/P2T.md' },
        { status: 'A', path: 'docs/coordination/requests/2026-10-23-p2t-snapshot-field.md' },
        { status: 'A', path: 'docs/adr/0050-timetable-versions.md' },
      ],
      noCtx,
    );
    assert.deepEqual(denied, []);
  });

  it('denies another stream, shared files, foreign ADRs and request edits', () => {
    const { denied } = classify(
      get('P2T'),
      [
        { status: 'M', path: 'apps/api/src/exams/exams.module.ts' },
        { status: 'M', path: 'apps/api/src/app.module.ts' },
        { status: 'M', path: 'apps/web/src/registry/nav/p4.ts' },
        { status: 'A', path: 'docs/adr/0060-x.md' },
        { status: 'M', path: 'docs/coordination/requests/2026-10-23-p4-x.md' },
        { status: 'M', path: 'packages/shared/src/contracts/setup-snapshot.v1.ts' },
      ],
      noCtx,
    );
    assert.equal(denied.length, 6);
  });

  it('checks both sides of a rename', () => {
    const { denied } = classify(
      get('P2T'),
      [{ status: 'R', oldPath: 'apps/api/src/exams/a.ts', path: 'apps/api/src/timetable/a.ts' }],
      noCtx,
    );
    assert.deepEqual(
      denied.map((d) => d.path),
      ['apps/api/src/exams/a.ts'],
    );
  });

  it('allows dependency-only package.json changes plus the lockfile', () => {
    const before = JSON.stringify({ name: 'x', scripts: { a: '1' }, dependencies: {} });
    const after = JSON.stringify({ name: 'x', scripts: { a: '1' }, dependencies: { y: '1.0.0' } });
    const ctx = { ...noCtx, packageJson: () => ({ before, after }) };
    const ok = classify(
      get('P2T'),
      [
        { status: 'M', path: 'apps/api/package.json' },
        { status: 'M', path: 'pnpm-lock.yaml' },
      ],
      ctx,
    );
    assert.deepEqual(ok.denied, []);
    const lockOnly = classify(get('P2T'), [{ status: 'M', path: 'pnpm-lock.yaml' }], ctx);
    assert.equal(lockOnly.denied.length, 1);
    const scripts = JSON.stringify({ name: 'x', scripts: { a: '2' }, dependencies: {} });
    const bad = classify(get('P2T'), [{ status: 'M', path: 'apps/api/package.json' }], {
      ...noCtx,
      packageJson: () => ({ before, after: scripts }),
    });
    assert.equal(bad.denied.length, 1);
    // P2E owns no Node package.
    const p2e = classify(get('P2E'), [{ status: 'M', path: 'apps/api/package.json' }], ctx);
    assert.equal(p2e.denied.length, 1);
  });

  it('allows the lockfile with a package.json the stream owns outright', () => {
    const ui = classify(
      get('UI'),
      [
        { status: 'M', path: 'packages/ui/package.json' },
        { status: 'M', path: 'pnpm-lock.yaml' },
      ],
      noCtx,
    );
    assert.deepEqual(ui.denied, []);
    const lockOnly = classify(get('UI'), [{ status: 'M', path: 'pnpm-lock.yaml' }], noCtx);
    assert.equal(lockOnly.denied.length, 1);
  });

  it('allows back-relation fields to own models in another schema file only', () => {
    const diff = [
      '--- a/packages/db/prisma/schema/core.prisma',
      '+++ b/packages/db/prisma/schema/core.prisma',
      '@@ -60,0 +61,2 @@',
      '+  timetables       Timetable[]',
      '+  publishedBy      TimetableVersion?  @relation("PublishedBy")',
    ].join('\n');
    const ctx = { ...noCtx, prismaDiff: () => diff, ownModels: ['Timetable', 'TimetableVersion'] };
    const change = [{ status: 'M', path: 'packages/db/prisma/schema/core.prisma' }];
    assert.deepEqual(classify(get('P2T'), change, ctx).denied, []);
    assert.equal(
      classify(get('P2T'), change, { ...ctx, ownModels: ['Timetable'] }).denied.length,
      1,
    );
  });

  it('rejects scalar or attribute edits in another schema file', () => {
    assert.deepEqual(badPrismaLines('+  timetableId String?', ['Timetable']), [
      '+  timetableId String?',
    ]);
    assert.equal(badPrismaLines('-  name String', ['Timetable']).length, 1);
    assert.equal(badPrismaLines('+  @@index([x])', ['Timetable']).length, 1);
  });

  it('lets INT edit anything', () => {
    const { denied } = classify(
      get('INT'),
      [
        { status: 'M', path: 'apps/api/src/app.module.ts' },
        { status: 'M', path: 'pnpm-lock.yaml' },
        { status: 'M', path: 'packages/db/prisma/schema/setup.prisma' },
      ],
      noCtx,
    );
    assert.deepEqual(denied, []);
  });
});

describe('onlyDependenciesChanged', () => {
  it('ignores dependency maps only', () => {
    assert.ok(
      onlyDependenciesChanged('{"a":1,"dependencies":{}}', '{"a":1,"devDependencies":{"b":"1"}}'),
    );
    assert.ok(!onlyDependenciesChanged('{"a":1}', '{"a":2}'));
  });
});
