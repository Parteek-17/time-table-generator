import {
  toDayNumber,
  type CalendarWindowRow,
  type CohortRow,
  type DepartmentRow,
  type ExtraWorkingDayRow,
  type HolidayRow,
  type ProgrammeRow,
  type TermRow,
} from '@slotwise/shared';
import { getMe, list } from '@/lib/me';
import { CalendarManager } from './calendar-manager';

/** A term's holidays, exam weeks and working Saturdays; used by /calendar and the wizard. */
export async function CalendarSection({ term }: { term: TermRow }) {
  const me = await getMe('/calendar');
  const [holidays, windows, extraDays, departments, programmes, cohorts] = await Promise.all([
    list<HolidayRow>('/holidays'),
    list<CalendarWindowRow>(`/calendar-windows?termId=${term.id}`),
    list<ExtraWorkingDayRow>(`/extra-working-days?termId=${term.id}`),
    list<DepartmentRow>('/departments'),
    list<ProgrammeRow>('/programmes'),
    list<CohortRow>(`/cohorts?termId=${term.id}`),
  ]);
  const [start, end] = [toDayNumber(term.startDate), toDayNumber(term.endDate)];
  const inTerm = holidays.filter(
    (h) => toDayNumber(h.endDate) >= start && toDayNumber(h.startDate) <= end,
  );
  return (
    <CalendarManager
      termId={term.id}
      holidays={inTerm}
      windows={windows}
      extraDays={extraDays}
      canManage={me.may('calendar.manage')}
      scope={{
        departments: departments.map((d) => ({ value: d.id, label: d.code })),
        programmes: programmes.map((p) => ({ value: p.id, label: p.name })),
        cohorts: cohorts.map((c) => ({ value: c.id, label: c.displayCode })),
      }}
    />
  );
}
