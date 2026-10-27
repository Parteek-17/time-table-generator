# Allow "unchanged" in import_rows.action

- Stream: P1
- Streams affected: none
- Files: packages/db/prisma/migrations/ (new migration)

## What

A new migration that lets `import_rows.action` be `unchanged`, next to `create`, `update`
and `skip`.

## Why

Re-importing a file shows which rows change nothing (milestone 1d, ADR 0011). The 1a
migration's CHECK allows only `create | update | skip`, so P1 stores an unchanged row as
`update` with a `$same` marker in its `data` (`apps/api/src/imports/imports.service.ts`,
`actionWhere()`). Once this lands, P1 drops the marker and stores `unchanged` directly.

## Exact proposed diff

`packages/db/prisma/migrations/20261027000000_import_rows_unchanged/migration.sql`:

```sql
ALTER TABLE "import_rows" DROP CONSTRAINT import_rows_action_check;
ALTER TABLE "import_rows" ADD CONSTRAINT import_rows_action_check
  CHECK (action IN ('create', 'update', 'unchanged', 'skip'));
```
