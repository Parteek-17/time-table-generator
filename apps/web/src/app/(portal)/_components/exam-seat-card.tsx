import { isFlagOn } from '@slotwise/shared';
import type { ExamSeatV1, TodayV1 } from '@slotwise/shared/contracts';
import { clock, EXAM_SEAT_DAYS_AHEAD, floorName, VIEWER_EXTRAS } from '@slotwise/shared/portal';
import {
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@slotwise/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { formatDay } from './portal-ui';

/** Link to P6's "My exams" page (all seats, or a teacher's invigilation duties). */
async function AllExamsLink({ label }: { label: string }) {
  return (
    <Link
      href="/exams"
      className={buttonVariants({ variant: 'outline', className: 'mt-2 self-start' })}
    >
      {label}
    </Link>
  );
}

/** The next exam seat in large type: hall and seat first, then when and where. */
async function SeatCard({ seat }: { seat: ExamSeatV1 }) {
  const t = await getTranslations('p5.exam');
  const day = await formatDay(seat.date);
  return (
    <section aria-labelledby="exam-seat" className="flex flex-col gap-2">
      <h2 id="exam-seat" className="text-lg font-semibold">
        {t('nextExam')}
      </h2>
      <Card className="border-primary">
        <CardHeader>
          <CardTitle>
            {seat.paperCode} · {seat.paperTitle}
          </CardTitle>
          <CardDescription className="text-base">
            {t('when', { day, session: seat.sessionLabel, time: clock(seat.reportingMinute) })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-sm text-muted-foreground">{t('hall')}</dt>
              <dd className="text-3xl font-bold tracking-wide">{seat.hallCode}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('seat')}</dt>
              <dd className="text-3xl font-bold tracking-wide">{seat.seatLabel}</dd>
            </div>
          </dl>
          <p>
            {seat.building ? `${seat.building}, ` : ''}
            {floorName(seat.floor)}
          </p>
          {isFlagOn('P6') ? <AllExamsLink label={t('allExams')} /> : null}
        </CardContent>
      </Card>
    </section>
  );
}

/** Exam seat on Today: the seat when one is within 14 days, else a short note for the bottom. */
export async function ExamSeatSlot({
  today,
  position,
}: {
  today: TodayV1;
  /** "top" renders only a seat; "bottom" renders only the note when there is no seat. */
  position: 'top' | 'bottom';
}) {
  if (position === 'top') return today.examSeat ? <SeatCard seat={today.examSeat} /> : null;
  if (today.examSeat) return null;
  const t = await getTranslations('p5.exam');
  const student = VIEWER_EXTRAS[today.viewer.role].examSeat;
  if (!isFlagOn('P6')) {
    return student ? (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription className="text-base">{t('soon')}</CardDescription>
        </CardHeader>
      </Card>
    ) : null;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{student ? t('title') : t('dutiesTitle')}</CardTitle>
        <CardDescription className="text-base">
          {student ? t('none', { days: EXAM_SEAT_DAYS_AHEAD }) : t('dutiesHint')}
        </CardDescription>
        <AllExamsLink label={student ? t('allExams') : t('duties')} />
      </CardHeader>
    </Card>
  );
}
