import { isFlagOn } from '@slotwise/shared';
import {
  EXAM_MANAGE,
  EXAM_VIEW,
  shortDate,
  type ExamSummaryDto,
  type ExamTermDto,
  type MyExamsDto,
} from '@slotwise/shared/exams';
import { Badge } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell';
import { Problem } from '@/components/problem';
import { api } from '@/lib/api';
import { getMe, list } from '@/lib/me';
import { MyExams } from './my-exams';
import { NewExamForm } from './new-exam-form';

export const metadata: Metadata = { title: 'Exams' };

/** Students and teachers: their seats or duties first. Exam staff: the institute's exams too. */
export default async function ExamsPage() {
  if (!isFlagOn('P6')) notFound();
  const me = await getMe('/exams');
  const t = await getTranslations('p6');
  const staff = me.may(EXAM_VIEW);
  const [mine, exams, terms] = await Promise.all([
    api<MyExamsDto>('/exams/me'),
    staff ? list<ExamSummaryDto>('/exams') : Promise.resolve([]),
    me.may(EXAM_MANAGE) ? list<ExamTermDto>('/exams/terms') : Promise.resolve([]),
  ]);
  const linked = mine.ok && mine.data.shows !== null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('page.title')} description={staff ? t('page.description') : undefined} />
      {linked ? <MyExams mine={mine.data} /> : null}
      {!staff && !linked ? (
        <Problem title={t('mine.notLinkedTitle')} body={t('mine.notLinkedBody')} />
      ) : null}

      {staff ? (
        <section aria-labelledby="all-exams" className="flex flex-col gap-3">
          <h2 id="all-exams" className="text-lg font-semibold">
            {t('list.title')}
          </h2>
          {exams.length === 0 ? (
            <p className="text-muted-foreground">{t('list.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {exams.map((exam) => (
                <li key={exam.id}>
                  <Link
                    href={`/exams/${exam.id}`}
                    className="flex min-h-12 flex-wrap items-center justify-between gap-2 rounded-md border p-3 hover:bg-muted"
                  >
                    <span className="font-medium">{exam.name}</span>
                    <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {exam.firstDate && exam.lastDate
                        ? `${shortDate(exam.firstDate)} – ${shortDate(exam.lastDate)}`
                        : t('list.noDates')}
                      <Badge>{t('list.papers', { count: exam.paperCount })}</Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {me.may(EXAM_MANAGE) ? <NewExamForm terms={terms} /> : null}
        </section>
      ) : null}
    </div>
  );
}
