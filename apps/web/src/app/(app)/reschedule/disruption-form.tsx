'use client';

import type { CreateDisruptionResult, RescheduleChoicesDto } from '@slotwise/shared/reschedule';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  FieldError,
  Input,
  Label,
  NativeSelect,
} from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useState, useTransition, type ReactNode } from 'react';
import { addDisruption, undoDisruption } from './actions';
import { minuteOf } from './format';

const KINDS = ['holiday', 'event', 'faculty_leave', 'other'] as const;
const SCOPES = ['institute', 'department', 'section'] as const;

type Notice =
  | { kind: 'added'; title: string; result: CreateDisruptionResult }
  | { kind: 'undone'; restored: number; keptByOther: number };

/**
 * "Add a holiday or event": classes in its dates are cancelled at once, and the notice that
 * follows offers Undo instead of asking to confirm first.
 */
export function DisruptionForm({
  termId,
  choices,
  departments,
}: {
  termId: string;
  choices: RescheduleChoicesDto;
  /** Department id → name. */
  departments: Record<string, string>;
}) {
  const t = useTranslations('p4.add');
  const tn = useTranslations('p4.notice');
  const [kind, setKind] = useState<(typeof KINDS)[number]>('holiday');
  const [scope, setScope] = useState<(typeof SCOPES)[number]>('institute');
  const [partDay, setPartDay] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (form: FormData) =>
    startTransition(async () => {
      setMessage(null);
      setErrors({});
      const text = (name: string) => String(form.get(name) ?? '');
      const startMinute = partDay ? minuteOf(text('startTime')) : null;
      const endMinute = partDay ? minuteOf(text('endTime')) : null;
      const title = text('title');
      const res = await addDisruption(termId, {
        kind,
        title,
        scopeType: kind === 'faculty_leave' ? 'institute' : scope,
        departmentId: text('departmentId') || null,
        sectionId: text('sectionId') || null,
        facultyId: text('facultyId') || null,
        startDate: text('startDate'),
        endDate: text('endDate') || text('startDate'),
        startMinute,
        endMinute,
      });
      if (!res.ok) {
        setMessage(res.message);
        setErrors(res.fieldErrors ?? {});
        return;
      }
      setNotice({ kind: 'added', title, result: res.result });
    });

  const undo = (id: string) =>
    startTransition(async () => {
      const res = await undoDisruption(id);
      if (!res.ok) return setMessage(res.message);
      setNotice({ kind: 'undone', ...res.result });
    });

  const field = (name: string, label: string, control: ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`d-${name}`}>{label}</Label>
      {control}
      {errors[name]?.map((e) => (
        <FieldError key={e}>{e}</FieldError>
      ))}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {notice ? (
          <Alert variant="success" role="status" className="flex flex-col gap-2">
            {notice.kind === 'added' ? (
              <>
                <p>
                  {tn('added', { title: notice.title, count: notice.result.cancelled })}
                  {notice.result.alreadyCancelled > 0
                    ? ` ${tn('alreadyCancelled', { count: notice.result.alreadyCancelled })}`
                    : null}
                  {notice.result.noTimetable ? ` ${tn('noTimetable')}` : null}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => undo(notice.result.disruption.id)}
                  >
                    {pending ? tn('undoing') : tn('undo')}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setNotice(null)}>
                    {tn('dismiss')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p>
                  {tn('undone', { count: notice.restored })}
                  {notice.keptByOther > 0
                    ? ` ${tn('keptByOther', { count: notice.keptByOther })}`
                    : null}
                </p>
                <div>
                  <Button type="button" variant="ghost" onClick={() => setNotice(null)}>
                    {tn('dismiss')}
                  </Button>
                </div>
              </>
            )}
          </Alert>
        ) : null}

        <form action={submit} className="grid gap-4 sm:grid-cols-2">
          {field(
            'kind',
            t('kind'),
            <NativeSelect
              id="d-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kinds.${k}`)}
                </option>
              ))}
            </NativeSelect>,
          )}
          {field(
            'title',
            t('name'),
            <Input
              id="d-title"
              name="title"
              required
              maxLength={120}
              placeholder={t('namePlaceholder')}
            />,
          )}

          {kind === 'faculty_leave' ? (
            field(
              'facultyId',
              t('teacher'),
              <NativeSelect id="d-facultyId" name="facultyId" required defaultValue="">
                <option value="" disabled>
                  {t('pick')}
                </option>
                {choices.faculty.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </NativeSelect>,
            )
          ) : (
            <>
              {field(
                'scopeType',
                t('who'),
                <NativeSelect
                  id="d-scopeType"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as (typeof SCOPES)[number])}
                >
                  {SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {t(`scopes.${s}`)}
                    </option>
                  ))}
                </NativeSelect>,
              )}
              {scope === 'department'
                ? field(
                    'departmentId',
                    t('department'),
                    <NativeSelect id="d-departmentId" name="departmentId" required defaultValue="">
                      <option value="" disabled>
                        {t('pick')}
                      </option>
                      {choices.departmentIds.map((id) => (
                        <option key={id} value={id}>
                          {departments[id] ?? id}
                        </option>
                      ))}
                    </NativeSelect>,
                  )
                : null}
              {scope === 'section'
                ? field(
                    'sectionId',
                    t('section'),
                    <NativeSelect id="d-sectionId" name="sectionId" required defaultValue="">
                      <option value="" disabled>
                        {t('pick')}
                      </option>
                      {choices.sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </NativeSelect>,
                  )
                : null}
            </>
          )}

          {field(
            'startDate',
            t('from'),
            <Input
              id="d-startDate"
              name="startDate"
              type="date"
              required
              min={choices.termStart}
              max={choices.termEnd}
              defaultValue={choices.today}
            />,
          )}
          {field(
            'endDate',
            t('to'),
            <Input
              id="d-endDate"
              name="endDate"
              type="date"
              min={choices.termStart}
              max={choices.termEnd}
              defaultValue={choices.today}
            />,
          )}

          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox
              id="d-partDay"
              checked={partDay}
              onChange={(e) => setPartDay(e.target.checked)}
            />
            <Label htmlFor="d-partDay">{t('partDay')}</Label>
          </div>
          {partDay ? (
            <>
              {field(
                'startMinute',
                t('startTime'),
                <Input id="d-startMinute" name="startTime" type="time" required />,
              )}
              {field(
                'endMinute',
                t('endTime'),
                <Input id="d-endMinute" name="endTime" type="time" required />,
              )}
            </>
          ) : null}

          <div className="flex flex-col gap-2 sm:col-span-2">
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={pending} className="min-h-11">
                {pending ? t('adding') : t('submit')}
              </Button>
              <p className="text-sm text-muted-foreground">{t('hint')}</p>
            </div>
            {message ? <Alert variant="destructive">{message}</Alert> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
