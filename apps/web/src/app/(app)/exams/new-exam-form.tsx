'use client';

import type { ExamTermDto } from '@slotwise/shared/exams';
import { Alert, Button, FieldError, Input, Label, NativeSelect } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createExam } from './actions';

/** Name and term only; seating settings keep their defaults until someone changes them. */
export function NewExamForm({ terms }: { terms: ExamTermDto[] }) {
  const t = useTranslations('p6.newExam');
  const router = useRouter();
  const current = terms.find((x) => x.status === 'active') ?? terms[0];
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();
  if (terms.length === 0) return <p className="text-muted-foreground">{t('noTerms')}</p>;

  return (
    <form
      className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-end"
      action={(form) =>
        startTransition(async () => {
          setError(null);
          const res = await createExam({
            termId: String(form.get('termId')),
            name: String(form.get('name')),
            reserveSeatsPerHall: 0,
            studentsPerInvigilator: 30,
            minInvigilatorsPerHall: 1,
          });
          if (!res.ok) {
            setFields(res.fieldErrors ?? {});
            return setError(res.message);
          }
          router.push(`/exams/${res.data.id}`);
        })
      }
    >
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor="exam-name">{t('name')}</Label>
        <Input
          id="exam-name"
          name="name"
          required
          placeholder={t('namePlaceholder')}
          aria-invalid={fields.name ? true : undefined}
        />
        {fields.name ? <FieldError>{fields.name.join(' ')}</FieldError> : null}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="exam-term">{t('term')}</Label>
        <NativeSelect id="exam-term" name="termId" defaultValue={current?.id}>
          {terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" disabled={pending} className="min-h-11">
        {pending ? t('creating') : t('create')}
      </Button>
      {error ? (
        <Alert variant="destructive" className="sm:basis-full">
          {error}
        </Alert>
      ) : null}
    </form>
  );
}
