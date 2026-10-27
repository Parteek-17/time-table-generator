import { floorName, shortDate, type MyExamsDto } from '@slotwise/shared/exams';
import { Card, CardContent, CardHeader, CardTitle } from '@slotwise/ui';
import { getTranslations } from 'next-intl/server';

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function place(building: string | null, floor: number | null): string {
  return [building, floor === null ? null : floorName(floor)].filter(Boolean).join(', ');
}

/**
 * A student's next seats or a teacher's duties, first thing on the page and readable at a
 * glance on a phone (CLAUDE.md: a student finds their seat in under 10 seconds).
 */
export async function MyExams({ mine }: { mine: MyExamsDto }) {
  const t = await getTranslations('p6.mine');
  if (mine.shows === 'seats') {
    return (
      <section aria-labelledby="my-seats" className="flex flex-col gap-3">
        <h2 id="my-seats" className="text-lg font-semibold">
          {t('seatsTitle')}
        </h2>
        {mine.seats.length === 0 ? (
          <p className="text-muted-foreground">{t('noSeats')}</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {mine.seats.map((s) => (
              <li key={`${s.date}-${s.startMinute}-${s.paperCode}`}>
                <Card>
                  <CardHeader className="pb-2">
                    <p className="text-sm text-muted-foreground">
                      {shortDate(s.date)} · {s.sessionLabel} · {hhmm(s.startMinute)}–
                      {hhmm(s.endMinute)}
                    </p>
                    <CardTitle className="text-base">
                      {s.paperCode} · {s.paperTitle}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-end gap-x-6 gap-y-1">
                    <p>
                      <span className="block text-xs uppercase text-muted-foreground">
                        {t('hall')}
                      </span>
                      <span className="text-3xl font-bold">{s.hallCode}</span>
                    </p>
                    <p>
                      <span className="block text-xs uppercase text-muted-foreground">
                        {t('seat')}
                      </span>
                      <span className="text-3xl font-bold">
                        {t('rowSeat', { row: s.row, column: s.column })}
                      </span>
                    </p>
                    <p className="w-full text-sm text-muted-foreground">
                      {place(s.building, s.floor)}
                      {place(s.building, s.floor) ? ' · ' : ''}
                      {t('rowHint')}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>
    );
  }
  if (mine.shows === 'duties') {
    return (
      <section aria-labelledby="my-duties" className="flex flex-col gap-3">
        <h2 id="my-duties" className="text-lg font-semibold">
          {t('dutiesTitle')}
        </h2>
        {mine.duties.length === 0 ? (
          <p className="text-muted-foreground">{t('noDuties')}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {mine.duties.map((d) => (
              <li
                key={`${d.date}-${d.startMinute}-${d.hallCode}`}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border p-3"
              >
                <span>
                  {shortDate(d.date)} · {d.sessionLabel} · {hhmm(d.startMinute)}–{hhmm(d.endMinute)}
                </span>
                <span className="font-semibold">
                  {t('hall')} {d.hallCode}
                  {place(d.building, d.floor) ? ` (${place(d.building, d.floor)})` : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    );
  }
  return null;
}
