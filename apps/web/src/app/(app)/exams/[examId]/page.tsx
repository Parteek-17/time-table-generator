import { isFlagOn } from '@slotwise/shared';
import {
  EXAM_MANAGE,
  EXAM_VIEW,
  shortDate,
  type DateSheetChoicesDto,
  type DateSheetDto,
} from '@slotwise/shared/exams';
import { Alert, Badge, buttonVariants } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell';
import { Problem } from '@/components/problem';
import { api } from '@/lib/api';
import { getMe } from '@/lib/me';
import { AddPaperForm, AddSessionForm, RemoveButton } from './date-sheet-forms';

export const metadata: Metadata = { title: 'Date sheet' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** An exam's date sheet: sessions in date order, their papers, and clashes in plain words. */
export default async function DateSheetPage({ params }: { params: Promise<{ examId: string }> }) {
  if (!isFlagOn('P6')) notFound();
  const { examId } = await params;
  if (!UUID.test(examId)) notFound();
  const me = await getMe(`/exams/${examId}`);
  if (!me.may(EXAM_VIEW)) notFound();
  const t = await getTranslations('p6');
  const manage = me.may(EXAM_MANAGE);
  const [sheet, choices] = await Promise.all([
    api<DateSheetDto>(`/exams/${examId}/date-sheet`),
    manage ? api<DateSheetChoicesDto>(`/exams/${examId}/choices`) : Promise.resolve(null),
  ]);
  if (!sheet.ok) {
    return <Problem title={t('sheet.notFound')} body={sheet.message} />;
  }
  const { exam, sessions, problems } = sheet.data;
  const clashes = new Set(problems.flatMap((p) => p.paperIds));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={exam.name}
        description={t('sheet.description', {
          sessions: exam.sessionCount,
          papers: exam.paperCount,
        })}
      >
        <Link href="/exams" className={buttonVariants({ variant: 'outline' })}>
          {t('sheet.back')}
        </Link>
      </PageHeader>

      {problems.length > 0 ? (
        <Alert variant="destructive">
          <p className="font-medium">{t('sheet.problemsTitle', { count: problems.length })}</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p) => (
              <li key={`${p.sessionId}-${p.sectionId}`}>{p.message}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {sessions.length === 0 ? <p className="text-muted-foreground">{t('sheet.empty')}</p> : null}
      <ol className="flex flex-col gap-4">
        {sessions.map((s) => {
          const students = s.papers.reduce((n, p) => n + p.studentCount, 0);
          return (
            <li key={s.id} className="rounded-md border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
                <h2 className="font-semibold">
                  {shortDate(s.date)} · {s.label}{' '}
                  <span className="font-normal text-muted-foreground">
                    {hhmm(s.startMinute)}–{hhmm(s.endMinute)}
                  </span>
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{t('sheet.students', { count: students })}</Badge>
                  {s.papers.length > 0 ? (
                    <Link
                      href={`/exams/${examId}/sessions/${s.id}`}
                      className={buttonVariants({ size: 'sm' })}
                    >
                      {t('sheet.seating')}
                    </Link>
                  ) : null}
                  {manage ? (
                    <RemoveButton
                      kind="session"
                      examId={examId}
                      id={s.id}
                      label={t('sheet.removeSession', {
                        session: `${shortDate(s.date)} ${s.label}`,
                      })}
                    />
                  ) : null}
                </div>
              </div>
              {s.papers.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">{t('sheet.noPapers')}</p>
              ) : (
                <ul className="divide-y">
                  {s.papers.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 p-3"
                    >
                      <span>
                        <span className="font-medium">{p.code}</span> {p.title}
                        <span className="block text-sm text-muted-foreground">
                          {p.sectionNames.join(', ')} ·{' '}
                          {t('sheet.students', { count: p.studentCount })}
                          {clashes.has(p.id) ? ` · ${t('sheet.clash')}` : ''}
                        </span>
                      </span>
                      {manage ? (
                        <RemoveButton
                          kind="paper"
                          examId={examId}
                          id={p.id}
                          label={t('sheet.removePaper', { code: p.code })}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      {manage && choices?.ok ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <AddSessionForm examId={examId} />
          {sessions.length > 0 ? (
            <AddPaperForm
              examId={examId}
              sessions={sessions.map((s) => ({
                id: s.id,
                label: `${shortDate(s.date)} · ${s.label}`,
              }))}
              choices={choices.data}
              onSheet={sessions.flatMap((s) => s.papers.map((p) => p.courseId))}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
