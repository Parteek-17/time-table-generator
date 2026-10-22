'use client';

import { formatTime, parseTime, WEEKDAYS } from '@slotwise/shared';
import {
  Alert,
  Button,
  Checkbox,
  cn,
  FieldError,
  Input,
  Label,
  NativeSelect,
  Textarea,
} from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useId, useState, useTransition, type ReactNode } from 'react';
import { saveEntity, type ActionResult } from '@/lib/entity-actions';

export type Values = Record<string, unknown>;
export interface Option {
  value: string;
  label: string;
}

interface Base {
  name: string;
  label: string;
  hint?: string;
  /** Two per row from the sm breakpoint. */
  half?: boolean;
  /** Show only when this returns true (e.g. scope pickers). */
  show?: (values: Values) => boolean;
}

export type FieldSpec = Base &
  (
    | { type: 'text' | 'email' | 'date' | 'textarea'; optional?: boolean; placeholder?: string }
    /** Minutes from midnight, edited as HH:MM. */
    | { type: 'time' }
    | { type: 'number'; optional?: boolean; min?: number; max?: number; step?: number }
    /** numeric: the value is a number (e.g. a weekday), options carry it as text. */
    | {
        type: 'select';
        options: Option[];
        optional?: boolean;
        emptyLabel?: string;
        numeric?: boolean;
      }
    /** string[] of option values, as checkboxes. */
    | { type: 'multiselect'; options: Option[] }
    | { type: 'checkbox' }
    /** string[] typed as "a, b, c". */
    | { type: 'list'; placeholder?: string }
    /** number[] typed as "1, 3, 5". */
    | { type: 'numberList'; placeholder?: string }
    /** ISO weekday numbers as toggle chips. */
    | { type: 'weekdays' }
  );

/** Turns the typed value into what an <input> shows. */
function display(field: FieldSpec, value: unknown): string {
  if (value == null) return '';
  if (field.type === 'time') return typeof value === 'number' ? formatTime(value) : '';
  if (field.type === 'list' || field.type === 'numberList')
    return Array.isArray(value) ? value.join(', ') : '';
  return String(value);
}

/** Parses what was typed into the JSON value the API expects (numbers, null, arrays). */
function parse(field: FieldSpec, raw: string): unknown {
  switch (field.type) {
    case 'number':
      return raw.trim() === '' ? null : Number(raw);
    case 'time':
      return parseTime(raw) ?? raw;
    case 'list':
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    case 'numberList':
      return raw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number);
    case 'select':
      return raw === '' ? null : field.numeric ? Number(raw) : raw;
    default:
      return field.type === 'text' ||
        field.type === 'email' ||
        field.type === 'textarea' ||
        field.type === 'date'
        ? field.optional && raw.trim() === ''
          ? null
          : raw
        : raw;
  }
}

export interface EntityFormProps<T> {
  fields: FieldSpec[];
  /** Current values (a row DTO when editing). Sent back whole, merged with the edits. */
  initial: Values;
  /** API collection, e.g. "/rooms". */
  path: string;
  /** Row id to update; null creates. */
  id: string | null;
  /** Page to refresh after saving. */
  revalidate: string;
  submitLabel: string;
  onSaved?: (data: T) => void;
  onCancel?: () => void;
  /** Extra content between the fields and the buttons. */
  children?: ReactNode;
  /** Clear the form after a successful create. */
  resetOnCreate?: boolean;
}

/**
 * A short form generated from field specs. Validation happens in the API (shared zod
 * schemas); its plain-language messages appear under each field.
 */
export function EntityForm<T>({
  fields,
  initial,
  path,
  id,
  revalidate,
  submitLabel,
  onSaved,
  onCancel,
  children,
  resetOnCreate = true,
}: EntityFormProps<T>) {
  const t = useTranslations('entity');
  const formId = useId();
  const [values, setValues] = useState<Values>(initial);
  // Text typed into list/number/time fields, kept until it parses.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult<T> | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (name: string, value: unknown) => setValues((v) => ({ ...v, [name]: value }));
  const visible = fields.filter((f) => !f.show || f.show(values));
  const errors = result?.ok === false ? (result.fieldErrors ?? {}) : {};
  const shown = new Set(visible.map((f) => f.name));
  const otherErrors = Object.entries(errors)
    .filter(([k]) => !shown.has(k))
    .flatMap(([, messages]) => messages);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const body: Values = { ...values };
    for (const f of fields) {
      if (f.name in drafts) body[f.name] = parse(f, drafts[f.name]!);
    }
    startTransition(async () => {
      const res = await saveEntity<T>(path, id, body, revalidate);
      setResult(res);
      if (res.ok) {
        if (!id && resetOnCreate) {
          setValues(initial);
          setDrafts({});
        }
        onSaved?.(res.data as T);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate aria-busy={pending}>
      {result?.ok === false && (otherErrors.length > 0 || !result.fieldErrors) ? (
        <Alert variant="destructive" role="alert">
          <p>{result.message}</p>
          {otherErrors.length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {otherErrors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}
      {result?.ok ? <Alert variant="success">{t('saved')}</Alert> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {visible.map((f) => {
          const fid = `${formId}-${f.name}`;
          const error = errors[f.name]?.[0];
          const describedBy =
            [error ? `${fid}-error` : null, f.hint ? `${fid}-hint` : null]
              .filter(Boolean)
              .join(' ') || undefined;
          const common = {
            id: fid,
            'aria-invalid': error ? true : undefined,
            'aria-describedby': describedBy,
          };
          const wide = !f.half || f.type === 'multiselect' || f.type === 'textarea';
          return (
            <div key={f.name} className={cn('flex flex-col gap-2', wide && 'sm:col-span-2')}>
              {f.type === 'checkbox' ? (
                <div className="flex items-center gap-3">
                  <Checkbox
                    {...common}
                    checked={Boolean(values[f.name])}
                    onChange={(e) => set(f.name, e.target.checked)}
                  />
                  <Label htmlFor={fid}>{f.label}</Label>
                </div>
              ) : f.type === 'multiselect' || f.type === 'weekdays' ? (
                <fieldset className="flex flex-col gap-2" aria-describedby={describedBy}>
                  <legend className="mb-2 text-sm font-medium">{f.label}</legend>
                  <ChoiceChips
                    options={
                      f.type === 'weekdays'
                        ? WEEKDAYS.map((d) => ({ value: String(d), label: t(`weekdayShort.${d}`) }))
                        : f.options
                    }
                    selected={((values[f.name] as unknown[]) ?? []).map(String)}
                    onChange={(sel) => set(f.name, f.type === 'weekdays' ? sel.map(Number) : sel)}
                  />
                </fieldset>
              ) : (
                <>
                  <Label htmlFor={fid}>{f.label}</Label>
                  {f.type === 'select' ? (
                    <NativeSelect
                      {...common}
                      value={values[f.name] == null ? '' : String(values[f.name])}
                      onChange={(e) => set(f.name, parse(f, e.target.value))}
                    >
                      <option value="" disabled={!f.optional}>
                        {f.emptyLabel ?? (f.optional ? t('none') : t('choose'))}
                      </option>
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : f.type === 'textarea' ? (
                    <Textarea
                      {...common}
                      value={(values[f.name] as string) ?? ''}
                      onChange={(e) => set(f.name, e.target.value)}
                    />
                  ) : (
                    <Input
                      {...common}
                      type={
                        f.type === 'number'
                          ? 'number'
                          : f.type === 'date'
                            ? 'date'
                            : f.type === 'email'
                              ? 'email'
                              : 'text'
                      }
                      inputMode={
                        f.type === 'number' ? 'numeric' : f.type === 'time' ? 'numeric' : undefined
                      }
                      placeholder={
                        'placeholder' in f ? f.placeholder : f.type === 'time' ? '09:00' : undefined
                      }
                      min={f.type === 'number' ? f.min : undefined}
                      max={f.type === 'number' ? f.max : undefined}
                      step={f.type === 'number' ? (f.step ?? 1) : undefined}
                      value={f.name in drafts ? drafts[f.name] : display(f, values[f.name])}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (
                          f.type === 'list' ||
                          f.type === 'numberList' ||
                          f.type === 'time' ||
                          f.type === 'number'
                        ) {
                          setDrafts((d) => ({ ...d, [f.name]: raw }));
                          // Numbers also update the values now, so dependent fields react.
                          if (f.type === 'number') set(f.name, parse(f, raw));
                        } else {
                          set(f.name, parse(f, raw));
                        }
                      }}
                    />
                  )}
                </>
              )}
              {f.hint ? (
                <p id={`${fid}-hint`} className="text-sm text-muted-foreground">
                  {f.hint}
                </p>
              ) : null}
              {error ? <FieldError id={`${fid}-error`}>{error}</FieldError> : null}
            </div>
          );
        })}
      </div>
      {children}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? t('saving') : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** Toggle chips backed by checkboxes (keyboard and screen-reader friendly). */
export function ChoiceChips({
  options,
  selected,
  onChange,
}: {
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <label
            key={o.value}
            className={cn(
              'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
              on && 'border-primary bg-primary/10 font-medium',
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={on}
              onChange={() =>
                onChange(on ? selected.filter((s) => s !== o.value) : [...selected, o.value])
              }
            />
            <span aria-hidden="true">{on ? '✓' : '+'}</span>
            {o.label}
          </label>
        );
      })}
    </div>
  );
}
