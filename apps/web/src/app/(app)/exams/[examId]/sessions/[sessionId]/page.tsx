import { isFlagOn } from '@slotwise/shared';
import {
  EXAM_DOCUMENTS,
  EXAM_MANAGE,
  EXAM_VIEW,
  shortDate,
  type DateSheetChoicesDto,
  type DateSheetDto,
  type InvigilatorDto,
  type SeatingPlanDto,
} from '@slotwise/shared/exams';
import { Alert, Badge, buttonVariants } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell';
import { Problem } from '@/components/problem';
import { api } from '@/lib/api';
import { getMe, list } from '@/lib/me';
import { BuildSeating, PublishPlan, Unavailable } from './seating-controls';

export const metadata: Metadata = { title: 'Seating plan' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** One exam session: build its seating plan, check it, publish it, print it. */
export default async function SeatingPage({
  params,
}: {
  params: Promise<{ examId: string; sessionId: string }>;
}) {
  if (!isFlagOn('P6')) notFound();
  const { examId, sessionId } = await params;
  if (!UUID.test(examId) || !UUID.test(sessionId)) notFound();
  const path = `/exams/${examId}/sessions/${sessionId}`;
  const me = await getMe(path);
  if (!me.may(EXAM_VIEW)) notFound();
  const manage = me.may(EXAM_MANAGE);
  const t = await getTranslations('p6.seating');
  const [sheet, plans, invigilators, choices] = await Promise.all([
    api<DateSheetDto>(`/exams/${examId}/date-sheet`),
    list<SeatingPlanDto>(`/exams/sessions/${sessionId}/seating`),
    list<InvigilatorDto>(`/exams/sessions/${sessionId}/invigilators`),
    manage ? api<DateSheetChoicesDto>(`/exams/${examId}/choices`) : Promise.resolve(null),
  ]);
  const session = sheet.ok ? sheet.data.sessions.find((s) => s.id === sessionId) : undefined;
  if (!sheet.ok || !session) return <Problem title={t('notFound')} />;

  const published = plans.find((p) => p.status === 'published');
  const latest = plans[0];
  const shown = latest?.status === 'ready' || !published ? latest : published;
  const students = session.papers.reduce((n, p) => n + p.studentCount, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${shortDate(session.date)} · ${session.label}`}
        description={t('description', {
          exam: sheet.data.exam.name,
          papers: session.papers.map((p) => p.code).join(', '),
          students,
        })}
      >
        <Link href={`/exams/${examId}`} className={buttonVariants({ variant: 'outline' })}>
          {t('back')}
        </Link>
      </PageHeader>

      {manage && choices?.ok ? (
        <BuildSeating
          sessionId={sessionId}
          rooms={choices.data.rooms}
          students={students}
          running={latest?.status === 'queued' || latest?.status === 'running' ? latest.id : null}
          hasPlan={plans.some((p) => p.status === 'ready' || p.status === 'published')}
        />
      ) : null}

      {!shown ? <p className="text-muted-foreground">{t('none')}</p> : null}
      {shown?.status === 'failed' ? (
        <Alert variant="destructive">{shown.error ?? t('failed')}</Alert>
      ) : null}

      {shown && (shown.status === 'ready' || shown.status === 'published') ? (
        <section aria-labelledby="plan" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="plan" className="text-lg font-semibold">
              {t('planTitle')}{' '}
              <Badge>{shown.status === 'published' ? t('published') : t('draft')}</Badge>
            </h2>
            {manage && shown.status === 'ready' ? (
              <PublishPlan planId={shown.id} path={path} hasProblems={shown.unseated.length > 0} />
            ) : null}
          </div>
          <p>{t('seated', { seated: shown.seated, students })}</p>

          {shown.unseated.length > 0 ? (
            <Alert variant="destructive">
              <p className="font-medium">{t('unseatedTitle', { count: shown.unseated.length })}</p>
              <ul className="mt-1 list-disc pl-5">
                {shown.unseated.slice(0, 10).map((u) => (
                  <li key={u.studentId}>{u.message}</li>
                ))}
              </ul>
              {shown.unseated.length > 10 ? (
                <p className="mt-1">{t('andMore', { count: shown.unseated.length - 10 })}</p>
              ) : null}
            </Alert>
          ) : null}
          {shown.invigilationProblems.length > 0 ? (
            <Alert variant="destructive">
              <ul className="list-disc pl-5">
                {shown.invigilationProblems.map((p) => (
                  <li key={p.hallId}>{p.message}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {/* One card per hall rather than a table: four columns do not fit a phone. */}
          <ul aria-label={t('hallsCaption')} className="grid gap-2 sm:grid-cols-2">
            {shown.halls.map((h) => (
              <li key={h.hallId} className="rounded-md border p-3 text-sm">
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-base font-semibold">
                    {t('hall')} {h.code}
                  </span>
                  <span className="text-muted-foreground">
                    {h.reserved > 0
                      ? t('usedOfReserved', {
                          used: h.used,
                          capacity: h.capacity,
                          reserved: h.reserved,
                        })
                      : t('usedOf', { used: h.used, capacity: h.capacity })}
                  </span>
                </p>
                <p>
                  {t('papers')}: {h.papers.join(', ')}
                </p>
                <p>
                  {t('invigilators')}: {h.invigilators.join(', ') || t('noInvigilator')}
                </p>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2">
            <h3 className="font-medium">{t('downloads')}</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {EXAM_DOCUMENTS.map((doc) => (
                <li key={doc} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                  <span className="flex-1">{t(`doc.${doc}`)}</span>
                  {(['pdf', 'xlsx'] as const).map((format) => (
                    <a
                      key={format}
                      className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      href={`/exams/download?plan=${shown.id}&doc=${doc}&format=${format}`}
                      aria-label={`${t(`doc.${doc}`)} (${format === 'pdf' ? 'PDF' : 'Excel'})`}
                    >
                      {format === 'pdf' ? 'PDF' : 'Excel'}
                    </a>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {invigilators.length > 0 ? (
        <Unavailable
          sessionId={sessionId}
          path={path}
          invigilators={invigilators}
          editable={manage}
        />
      ) : null}
    </div>
  );
}
