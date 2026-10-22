import {
  toDayNumber,
  type CalendarWindowRow,
  type CohortRow,
  type DepartmentRow,
  type ExtraWorkingDayRow,
  type HolidayRow,
  type ProgrammeRow,
} from '@slotwise/shared';
import { buttonVariants } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageHeader } from '@/components/app-shell';
import { Problem } from '@/components/problem';
import { TermPicker } from '@/components/term-picker';
import { getMe, list } from '@/lib/me';
import { pickTerm } from '@/lib/terms';
import { CalendarManager } from './calendar-manager';

export const metadata: Metadata = { title: 'Calendar' };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  const me = await getMe('/calendar');
  const t = await getTranslations('calendar');
  const { terms, term } = await pickTerm((await searchParams).term);
  if (!term) {
    return (
      <>
        <PageHeader title={t('title')} />
        <Problem title={t('noTermTitle')} body={t('noTermBody')}>
          <Link href="/terms" className={buttonVariants()}>
            {t('goToTerms')}
          </Link>
        </Problem>
      </>
    );
  }
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
    <>
      <PageHeader title={t('title')} description={t('subtitle', { term: term.label })}>
        <TermPicker terms={terms} current={term.id} />
      </PageHeader>
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
    </>
  );
}
