# check:ownership rejects the lockfile when a stream owns the whole package

- Stream: UI
- Streams affected: INT (script), any stream that owns a whole package
- Files: scripts/lib/ownership.mjs

## What

On `ui/kit`, `pnpm check:ownership` reports:

```
✗ pnpm-lock.yaml
    lockfile changed without a dependency change you own
```

UI added dependencies to `packages/ui/package.json`. `classify()` returns early for paths the
stream owns (`packages/ui/**`), so that package.json never reaches the branch that records
`changedOwnDeps`, and the lockfile is then denied. OWNERSHIP.md allows `pnpm-lock.yaml`
"together with such a change".

The lockfile diff on `ui/kit` is the `packages/ui` importer (new deps) plus pnpm re-sharing one
`next-intl` / `@vitest/mocker` peer set between `apps/web` and `packages/ui` (no version
changes).

## Exact proposed diff

```diff
   const check = (path, status) => {
+    const ownPkg = /^(.*)\/package\.json$/.exec(path)?.[1];
+    if (ownPkg && packages.includes(ownPkg) && own(path)) changedOwnDeps.add(ownPkg);
     if (own(path) || isOwnAdr(entry.stream, path)) return null;
```

(Records any change to a package.json the stream owns outright; plus a test in
`ownership.test.mjs` next to "allows dependency-only package.json changes plus the lockfile".)
