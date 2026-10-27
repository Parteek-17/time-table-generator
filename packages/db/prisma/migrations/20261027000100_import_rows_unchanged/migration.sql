-- P1 request: re-imports mark rows that change nothing as 'unchanged' (ADR 0011).
ALTER TABLE "import_rows" DROP CONSTRAINT import_rows_action_check;
ALTER TABLE "import_rows" ADD CONSTRAINT import_rows_action_check
  CHECK (action IN ('create', 'update', 'unchanged', 'skip'));
