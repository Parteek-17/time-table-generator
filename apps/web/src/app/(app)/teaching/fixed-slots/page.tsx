import type {
  BellScheduleRow,
  CohortRow,
  DepartmentRow,
  FacultyRow,
  FixedSlotRow,
  ProgrammeRow,
  SectionRow,
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
import { FixedSlotsManager } from './manager';

export const metadata: Metadata = { title: 'Fixed slots' };

/** Mentoring, library, sports … periods no regular class may use (plan screen 10). */
export default async function FixedSlotsPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  const me = await getMe('/teaching/fixed-slots');
  const [t, tTeaching] = await Promise.all([
    getTranslations('p1.fixedSlots'),
    getTranslations('p1.teaching'),
  ]);
  const { terms, term } = await pickTerm((await searchParams).term);
  if (!term) {
    return (
      <>
        <PageHeader title={t('title')} />
        <Problem title={tTeaching('noTermTitle')} body={tTeaching('noTermBody')}>
          <Link href="/terms" className={buttonVariants()}>
            {tTeaching('open')}
          </Link>
        </Problem>
      </>
    );
  }
  const [slots, bells, faculty, departments, programmes, cohorts, sections] = await Promise.all([
    list<FixedSlotRow>(`/fixed-slots?termId=${term.id}`),
    list<BellScheduleRow>('/bell-schedules'),
    list<FacultyRow>('/faculty'),
    list<DepartmentRow>('/departments'),
    list<ProgrammeRow>('/programmes'),
    list<CohortRow>(`/cohorts?termId=${term.id}`),
    list<SectionRow>(`/sections?termId=${term.id}`),
  ]);
  const bell = bells.find((b) => b.isDefault) ?? bells[0] ?? null;
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle', { term: term.label })}>
        <TermPicker terms={terms} current={term.id} />
      </PageHeader>
      <FixedSlotsManager
        termId={term.id}
        slots={slots}
        workingDays={bell?.workingDays ?? [1, 2, 3, 4, 5]}
        periods={bell?.periods.map((p) => ({ index: p.index, label: p.label })) ?? []}
        faculty={faculty.map((f) => ({ value: f.id, label: `${f.name} (${f.shortCode})` }))}
        canManage={me.may('fixed_slot.manage')}
        scope={{
          departments: departments.map((d) => ({ value: d.id, label: d.code })),
          programmes: programmes.map((p) => ({ value: p.id, label: p.name })),
          cohorts: cohorts.map((c) => ({ value: c.id, label: c.displayCode })),
          sections: sections.map((s) => ({ value: s.id, label: s.displayName })),
        }}
      />
    </>
  );
}
