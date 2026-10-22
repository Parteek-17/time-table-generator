import type { CourseRow, DepartmentRow, ProgrammeRow, SchemeVersionRow } from '@slotwise/shared';
import { cn } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell';
import { ArchivedToggle } from '@/components/entity/archived-toggle';
import { api } from '@/lib/api';
import { getMe, list } from '@/lib/me';
import { CoursesManager } from './courses-manager';

export const metadata: Metadata = { title: 'Courses' };

export default async function SchemeCoursesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ semester?: string; archived?: string }>;
}) {
  const { id } = await params;
  const me = await getMe(`/schemes/${id}`);
  const t = await getTranslations('courses');
  const scheme = await api<SchemeVersionRow>(`/scheme-versions/${encodeURIComponent(id)}`);
  if (!scheme.ok) notFound();
  const { semester: semesterParam, archived } = await searchParams;
  const [programmes, departments] = await Promise.all([
    list<ProgrammeRow>('/programmes'),
    list<DepartmentRow>('/departments'),
  ]);
  const programme = programmes.find((p) => p.id === scheme.data.programmeId);
  if (!programme) notFound();
  const semester = Math.min(Math.max(Number(semesterParam) || 1, 1), programme.totalSemesters);
  const courses = await list<CourseRow>(
    `/courses?schemeVersionId=${id}&semester=${semester}${archived ? '&includeArchived=1' : ''}`,
  );
  const branches = programme.branches.filter((b) => !b.isDefault);
  const deptOfBranch = new Map(branches.map((b) => [b.id, b.departmentId]));
  const ownerOf = (c: CourseRow): string | null => {
    const depts = new Set(c.branchIds.map((b) => deptOfBranch.get(b)));
    if (c.branchIds.length > 0) return depts.size === 1 ? ([...depts][0] ?? null) : null;
    return programme.departmentId;
  };

  return (
    <>
      <PageHeader
        title={t('title', { programme: programme.name, scheme: scheme.data.name })}
        description={t('subtitle')}
      >
        <ArchivedToggle showing={Boolean(archived)} base={`?semester=${semester}`} />
      </PageHeader>
      <nav aria-label={t('semesters')} className="flex flex-wrap gap-2">
        {Array.from({ length: programme.totalSemesters }, (_, i) => i + 1).map((s) => (
          <Link
            key={s}
            href={`?semester=${s}`}
            aria-current={s === semester ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-sm',
              s === semester && 'border-primary bg-primary/10 font-semibold',
            )}
          >
            {t('semesterShort', { semester: s })}
          </Link>
        ))}
      </nav>
      <CoursesManager
        rows={courses}
        schemeVersionId={id}
        semester={semester}
        revalidate={`/schemes/${id}`}
        branches={branches.map((b) => ({ value: b.id, label: b.code }))}
        departments={departments.map((d) => ({ value: d.id, label: d.code }))}
        canCreate={me.may('academics.manage')}
        editable={courses
          .filter((c) => me.mayOn('academics.manage', { type: 'course', departmentId: ownerOf(c) }))
          .map((c) => c.id)}
      />
    </>
  );
}
