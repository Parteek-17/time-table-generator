import type {
  CohortRow,
  CourseRow,
  ElectiveSectionRow,
  RoomRow,
  SectionRow,
} from '@slotwise/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell';
import { api } from '@/lib/api';
import { getMe, list } from '@/lib/me';
import { CohortSettings, ElectiveSections, Sections } from './cohort-detail';

export const metadata: Metadata = { title: 'Cohort' };

export default async function CohortPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe(`/cohorts/${id}`);
  const t = await getTranslations('cohorts');
  const res = await api<CohortRow>(`/cohorts/${encodeURIComponent(id)}`);
  if (!res.ok) notFound();
  const cohort = res.data;
  const [sections, termCohorts, termSections, electives, courses, rooms] = await Promise.all([
    list<SectionRow>(`/sections?cohortId=${id}`),
    list<CohortRow>(`/cohorts?termId=${cohort.termId}`),
    list<SectionRow>(`/sections?termId=${cohort.termId}`),
    list<ElectiveSectionRow>(`/elective-sections?termId=${cohort.termId}&cohortId=${id}`),
    list<CourseRow>(
      `/courses?schemeVersionId=${cohort.schemeVersionId}&semester=${cohort.semester}`,
    ),
    list<RoomRow>('/rooms'),
  ]);
  const canEdit = me.mayOn('cohort.manage', { type: 'cohort', departmentId: cohort.departmentId });
  const cohortCode = new Map(termCohorts.map((c) => [c.id, c.displayCode]));
  const electiveCourses = courses.filter(
    (c) =>
      (c.type === 'programme_elective' || c.type === 'open_elective') &&
      (c.branchIds.length === 0 || c.branchIds.includes(cohort.branchId)),
  );
  const prefix = sections[0]?.displayName.split(' ').slice(0, -1).join(' ') || cohort.branchCode;

  return (
    <>
      <PageHeader
        title={cohort.displayCode}
        description={t('detailLine', {
          programme: cohort.programmeCode,
          semester: cohort.semester,
          year: cohort.admissionYear,
        })}
      />
      <CohortSettings
        cohort={cohort}
        canEdit={canEdit}
        hosts={termCohorts
          .filter(
            (c) => c.id !== cohort.id && !c.joinsCohortId && c.programmeId === cohort.programmeId,
          )
          .map((c) => ({ value: c.id, label: c.displayCode }))}
      />
      {cohort.joinsCohortId ? (
        <p className="text-muted-foreground">
          {t('joinsExplain', { host: cohortCode.get(cohort.joinsCohortId) ?? '?' })}
        </p>
      ) : (
        <Sections
          cohortId={id}
          rows={sections}
          canEdit={canEdit}
          prefix={prefix}
          rooms={rooms
            .filter((r) => r.type === 'lecture' || r.type === 'tutorial')
            .map((r) => ({ value: r.id, label: `${r.code} (${r.classCapacity})` }))}
        />
      )}
      {electiveCourses.length > 0 ? (
        <ElectiveSections
          cohortId={id}
          termId={cohort.termId}
          rows={electives}
          canEdit={canEdit}
          courses={electiveCourses.map((c) => ({ value: c.id, label: `${c.code} · ${c.title}` }))}
          sections={termSections.map((s) => ({
            value: s.id,
            label: `${s.displayName} (${cohortCode.get(s.cohortId) ?? ''})`,
          }))}
        />
      ) : null}
    </>
  );
}
