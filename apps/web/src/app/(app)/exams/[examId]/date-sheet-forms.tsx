'use client';

import type { DateSheetChoicesDto } from '@slotwise/shared/exams';
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
import { useState, useTransition } from 'react';
import { addPaper, addSession, removePaper, removeSession } from '../actions';

const toMinute = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

function Errors({ messages }: { messages?: string[] }) {
  return messages?.length ? <FieldError>{messages.join(' ')}</FieldError> : null;
}

/** Sensible defaults: the morning session 10:00–13:00, the evening one 14:00–17:00. */
export function AddSessionForm({ examId }: { examId: string }) {
  const t = useTranslations('p6.addSession');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [label, setLabel] = useState('Morning');
  const [pending, startTransition] = useTransition();
  const evening = label.trim().toLowerCase() === 'evening';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          key={evening ? 'evening' : 'other'}
          className="grid gap-3 sm:grid-cols-2"
          action={(form) =>
            startTransition(async () => {
              setError(null);
              const res = await addSession(examId, {
                date: String(form.get('date')),
                label: String(form.get('label')),
                startMinute: toMinute(String(form.get('start'))),
                endMinute: toMinute(String(form.get('end'))),
              });
              if (!res.ok) {
                setFields(res.fieldErrors ?? {});
                return setError(res.message);
              }
              setFields({});
            })
          }
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="session-date">{t('date')}</Label>
            <Input id="session-date" name="date" type="date" required />
            <Errors messages={fields.date} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="session-label">{t('label')}</Label>
            <Input
              id="session-label"
              name="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              list="session-labels"
              required
            />
            <datalist id="session-labels">
              <option value="Morning" />
              <option value="Evening" />
            </datalist>
            <Errors messages={fields.label} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="session-start">{t('start')}</Label>
            <Input
              id="session-start"
              name="start"
              type="time"
              defaultValue={evening ? '14:00' : '10:00'}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="session-end">{t('end')}</Label>
            <Input
              id="session-end"
              name="end"
              type="time"
              defaultValue={evening ? '17:00' : '13:00'}
              required
            />
            <Errors messages={fields.endMinute} />
          </div>
          <Button type="submit" disabled={pending} className="min-h-11 sm:col-span-2">
            {pending ? t('adding') : t('add')}
          </Button>
          {error ? (
            <Alert variant="destructive" className="sm:col-span-2">
              {error}
            </Alert>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

/** Pick a course taught this term; its sections come pre-ticked. */
export function AddPaperForm({
  examId,
  sessions,
  choices,
  onSheet,
}: {
  examId: string;
  sessions: { id: string; label: string }[];
  choices: DateSheetChoicesDto;
  onSheet: string[];
}) {
  const t = useTranslations('p6.addPaper');
  const courses = choices.courses.filter((c) => !onSheet.includes(c.id));
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const course = courses.find((c) => c.id === courseId);
  const [ticked, setTicked] = useState<string[]>(course?.sectionIds ?? []);
  // "CS A" exists in every semester: show the course's semester (and anything ticked) unless
  // asked for all of them.
  const [allSemesters, setAllSemesters] = useState(false);
  const sections = choices.sections.filter(
    (s) => allSemesters || s.semester === course?.semester || ticked.includes(s.id),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (courses.length === 0) {
    return <p className="text-muted-foreground">{t('allOnSheet')}</p>;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          action={(form) =>
            startTransition(async () => {
              setError(null);
              const res = await addPaper(examId, {
                sessionId: String(form.get('sessionId')),
                courseId,
                sectionIds: ticked,
              });
              if (!res.ok) return setError(res.message);
              const next = courses.find((c) => c.id !== courseId);
              setCourseId(next?.id ?? '');
              setTicked(next?.sectionIds ?? []);
            })
          }
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="paper-course">{t('course')}</Label>
            <NativeSelect
              id="paper-course"
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setTicked(courses.find((c) => c.id === e.target.value)?.sectionIds ?? []);
              }}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.title} (Sem {c.semester})
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="paper-session">{t('session')}</Label>
            <NativeSelect id="paper-session" name="sessionId">
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">{t('sections')}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {sections.map((s) => (
                <label key={s.id} className="flex min-h-11 items-center gap-2 rounded border px-2">
                  <Checkbox
                    checked={ticked.includes(s.id)}
                    onChange={(e) =>
                      setTicked((now) =>
                        e.target.checked ? [...now, s.id] : now.filter((x) => x !== s.id),
                      )
                    }
                  />
                  <span>
                    {s.name}{' '}
                    <span className="text-sm text-muted-foreground">
                      {t('sectionDetail', { semester: s.semester, count: s.studentCount })}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <label className="mt-1 flex min-h-11 items-center gap-2 text-sm">
              <Checkbox
                checked={allSemesters}
                onChange={(e) => setAllSemesters(e.target.checked)}
              />
              {t('allSemesters')}
            </label>
          </fieldset>
          <Button type="submit" disabled={pending || ticked.length === 0} className="min-h-11">
            {pending ? t('adding') : t('add')}
          </Button>
          {error ? <Alert variant="destructive">{error}</Alert> : null}
        </form>
      </CardContent>
    </Card>
  );
}

/** Removes a paper or a session straight away (date sheets are not master data). */
export function RemoveButton({
  kind,
  examId,
  id,
  label,
}: {
  kind: 'paper' | 'session';
  examId: string;
  id: string;
  label: string;
}) {
  const t = useTranslations('p6.sheet');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={label}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res =
              kind === 'paper' ? await removePaper(examId, id) : await removeSession(examId, id);
            if (!res.ok) setError(res.message);
          })
        }
      >
        {t('remove')}
      </Button>
      {error ? (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
