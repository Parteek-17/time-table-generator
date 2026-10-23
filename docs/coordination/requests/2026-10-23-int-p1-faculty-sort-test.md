# Faculty list test depends on letter case in sorting

- Stream: INT
- Streams affected: P1
- Files: apps/api/test/masterdata.e2e.test.ts

## What

`master data: every write works and is audited > faculty, availability and bulk load limits`
fails on `main` (and on every branch based on it):

```
expected [ [ 'TD', 16 ], [ 'TC', 16 ] ] to deeply equal [ [ 'TC', 16 ], [ 'TD', 16 ] ]
```

The test creates faculty named `Test tc` and `Test TD`. `GET /faculty` sorts by `name`, and
`postgres:16.15-alpine` (compose and CI) compares text byte by byte, so upper case sorts
before lower case and `Test TD` comes first.

## Why

`pnpm test` is red on `main`, which blocks every merge (INT never merges with red CI).

## Exact proposed diff

Keep the lower-case short code (it checks that the API upper-cases it) but give both faculty
names the same case. Alternatively, sort the faculty list case-insensitively in the API; that
is P1's call.

```diff
--- a/apps/api/test/masterdata.e2e.test.ts
+++ b/apps/api/test/masterdata.e2e.test.ts
@@ -335,7 +335,7 @@
     const make = (code: string, short: string, dept: string, userId?: string) =>
       write<FacultyRow>('post', '/faculty', {
         employeeCode: code,
-        name: `Test ${short}`,
+        name: `Test ${short.toUpperCase()}`,
         shortCode: short,
```
