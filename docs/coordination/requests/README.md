# Change requests

Need a change in a file your stream does not own (a shared file, another stream's code, a
contract, another schema file)? Don't make it. Add a request here and work around it locally
(an adapter or `*.mock.ts` in your own folder) until INT merges it.

One file per request: `requests/<YYYY-MM-DD>-<stream>-<slug>.md`, e.g.
`2026-10-23-p2t-snapshot-room-blocks.md`. New files only; INT edits, answers and moves them
(`done/` when merged, `rejected/` with a reason).

````markdown
# <Short title>

- Stream: P2T
- Streams affected: P1, P4
- Files: packages/shared/src/contracts/setup-snapshot.v1.ts

## What

## Why

## Exact proposed diff

```diff
...
```
````

Note the request under "Contract change requests" (or "Blocked by") in your status file.
Contracts are frozen once merged: a change is a new `v2` file, never an edit to `v1`.
