'use client';

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  NativeSelect,
} from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { saveMapping } from '../actions';

export interface ColumnInfo {
  key: string;
  label: string;
  required: boolean;
}

/** For each template column, which column of the file holds it (or "Not in my file"). */
export function MappingForm({
  jobId,
  headers,
  mapping,
  columns,
  missing,
}: {
  jobId: string;
  headers: string[];
  mapping: Record<string, number>;
  columns: ColumnInfo[];
  missing: string[];
}) {
  const t = useTranslations('p1.imports');
  const router = useRouter();
  const base = useId();
  const [choice, setChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(columns.map((c) => [c.key, c.key in mapping ? String(mapping[c.key]) : ''])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const missingNow = columns.filter((c) => c.required && choice[c.key] === '');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('mappingTitle')}</CardTitle>
        <CardDescription>{t('mappingHint')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError(null);
              const res = await saveMapping(
                jobId,
                Object.fromEntries(
                  Object.entries(choice).map(([k, v]) => [k, v === '' ? null : Number(v)]),
                ),
              );
              if (!res.ok) {
                setError(res.message ?? null);
                return;
              }
              router.push(`/imports/${jobId}`);
              router.refresh();
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {columns.map((c) => {
              const id = `${base}-${c.key}`;
              const isMissing = missing.includes(c.key) && choice[c.key] === '';
              return (
                <div key={c.key} className="flex flex-col gap-1">
                  <Label htmlFor={id}>
                    {c.label}
                    {c.required ? (
                      <span className="text-muted-foreground"> ({t('requiredMark')})</span>
                    ) : null}
                  </Label>
                  <NativeSelect
                    id={id}
                    value={choice[c.key]}
                    aria-invalid={isMissing || undefined}
                    onChange={(e) => setChoice((prev) => ({ ...prev, [c.key]: e.target.value }))}
                  >
                    <option value="">{t('notInFile')}</option>
                    {headers.map((h, i) =>
                      h.trim() === '' ? null : (
                        <option key={i} value={String(i)}>
                          {h}
                        </option>
                      ),
                    )}
                  </NativeSelect>
                </div>
              );
            })}
          </div>
          {error ? (
            <Alert variant="destructive" role="alert">
              {error}
            </Alert>
          ) : null}
          <div>
            <Button type="submit" disabled={pending || missingNow.length > 0}>
              {pending ? t('saving') : t('saveMapping')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
