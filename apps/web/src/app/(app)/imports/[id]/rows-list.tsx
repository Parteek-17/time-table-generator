'use client';

import type { ImportRowDto } from '@slotwise/shared';
import { Alert, Badge, Button, cn, FieldError, Input, Label } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { editRow } from '../actions';
import type { ColumnInfo } from './mapping-form';

/**
 * Rows of the preview as cards (phones first): what each row will do, its problems in plain
 * words next to the column, and an inline editor to fix it or skip it.
 */
export function RowsList({
  jobId,
  rows,
  columns,
  editable,
}: {
  jobId: string;
  rows: ImportRowDto[];
  columns: ColumnInfo[];
  editable: boolean;
}) {
  const t = useTranslations('p1.imports');
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t('noRows')}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <RowCard
          key={row.rowNumber}
          jobId={jobId}
          row={row}
          columns={columns}
          editable={editable}
        />
      ))}
    </ul>
  );
}

function RowCard({
  jobId,
  row,
  columns,
  editable,
}: {
  jobId: string;
  row: ImportRowDto;
  columns: ColumnInfo[];
  editable: boolean;
}) {
  const t = useTranslations('p1.imports');
  const router = useRouter();
  const base = useId();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(row.data);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const hasProblems = row.errors.length > 0 && row.action !== 'skip';
  const label = (key: string | null) => columns.find((c) => c.key === key)?.label ?? null;
  const errorsFor = (key: string) => row.errors.filter((e) => e.column === key);
  const filled = columns.filter((c) => (row.data[c.key] ?? '') !== '');

  const send = (edit: { data?: Record<string, string>; skip?: boolean }) =>
    start(async () => {
      setError(null);
      const res = await editRow(jobId, row.rowNumber, edit);
      if (!res.ok) {
        setError(res.message ?? null);
        return;
      }
      if (res.data && res.data.errors.length === 0) setEditing(false);
      router.refresh();
    });

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-3',
        hasProblems && 'border-destructive/50',
        row.action === 'skip' && 'opacity-70',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{t('rowLabel', { n: row.rowNumber })}</span>
          {hasProblems ? (
            <Badge className="border-destructive/50 bg-destructive/10">{t('problem')}</Badge>
          ) : (
            <Badge className={cn(row.action === 'create' && 'border-success/40 bg-success/10')}>
              {t(`action.${row.action}`)}
            </Badge>
          )}
        </div>
        {editable ? (
          <div className="flex gap-2">
            {row.action === 'skip' ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                aria-label={t('includeLabel', { n: row.rowNumber })}
                onClick={() => send({ skip: false })}
              >
                {t('includeRow')}
              </Button>
            ) : (
              <>
                {!editing ? (
                  <Button
                    size="sm"
                    variant={hasProblems ? 'default' : 'outline'}
                    aria-label={
                      hasProblems
                        ? t('fixLabel', { n: row.rowNumber })
                        : t('editLabel', { n: row.rowNumber })
                    }
                    onClick={() => {
                      setValues(row.data);
                      setEditing(true);
                    }}
                  >
                    {hasProblems ? t('fix') : t('edit')}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  aria-label={t('skipLabel', { n: row.rowNumber })}
                  onClick={() => send({ skip: true })}
                >
                  {t('skipRow')}
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {editing ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            send({ data: values });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {columns.map((c) => {
              const id = `${base}-${c.key}`;
              const problems = errorsFor(c.key);
              return (
                <div key={c.key} className="flex flex-col gap-1">
                  <Label htmlFor={id}>{c.label}</Label>
                  <Input
                    id={id}
                    value={values[c.key] ?? ''}
                    aria-invalid={problems.length > 0 || undefined}
                    aria-describedby={problems.length > 0 ? `${id}-error` : undefined}
                    onChange={(e) => setValues((prev) => ({ ...prev, [c.key]: e.target.value }))}
                  />
                  {problems.length > 0 ? (
                    <FieldError id={`${id}-error`}>
                      {problems.map((p) => p.message).join(' ')}
                    </FieldError>
                  ) : null}
                </div>
              );
            })}
          </div>
          {row.errors
            .filter((e) => e.column == null)
            .map((e, i) => (
              <FieldError key={i}>{e.message}</FieldError>
            ))}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? t('saving') : t('saveRow')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t('cancelEdit')}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            {filled.map((c) => (
              <div key={c.key} className="contents">
                <dt className="text-muted-foreground">{c.label}</dt>
                <dd className="break-words">{row.data[c.key]}</dd>
              </div>
            ))}
          </dl>
          {row.errors.length > 0 && row.action !== 'skip' ? (
            <ul className="flex flex-col gap-1 text-sm text-destructive">
              {row.errors.map((e, i) => (
                <li key={i}>
                  {label(e.column)
                    ? t('rowProblem', { column: label(e.column)!, message: e.message })
                    : e.message}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      {error ? (
        <Alert variant="destructive" role="alert">
          {error}
        </Alert>
      ) : null}
    </li>
  );
}
