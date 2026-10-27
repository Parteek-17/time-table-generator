import { isFlagOn } from '@slotwise/shared';
import type { GridBell, ViewSlot } from '@slotwise/shared/timetable';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ProgressBar,
  Skeleton,
  SlotCard,
  TimetableGrid,
} from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/app-shell';
import { PageShell } from '@/components/page-shell';
import { SegmentedDemo } from './segmented-demo';

export const metadata: Metadata = { title: 'UI gallery' };

/** A made-up week (fictional names) to draw the grid and cards with. */
const bell: GridBell = {
  workingDays: [1, 2, 3, 4, 5],
  periods: [1, 2, 3, 4, 5, 6].map((index) => {
    const start = 540 + (index - 1) * 50 + (index > 2 ? 10 : 0) + (index > 4 ? 40 : 0);
    return { index, label: `P${index}`, startMinute: start, endMinute: start + 50 };
  }),
  breaks: [
    { label: 'Short break', afterPeriodIndex: 2, minutes: 10 },
    { label: 'Lunch', afterPeriodIndex: 4, minutes: 40 },
  ],
};
const startOf = (period: number) => bell.periods[period - 1]!.startMinute;

function demoSlot(
  id: number,
  weekday: number,
  start: number,
  length: number,
  component: ViewSlot['component'],
  code: string,
  title: string,
  extra: Partial<ViewSlot> = {},
): ViewSlot {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    versionId: '00000000-0000-4000-8000-000000000000',
    weekday,
    startPeriodIndex: start,
    length,
    startMinute: startOf(start),
    endMinute: startOf(start + length - 1) + 50,
    assignmentId: '00000000-0000-4000-9000-000000000000',
    component,
    course: { id: code, code, shortName: '', title },
    target: { kind: 'section', id: 's1', name: 'CSE 5A' },
    sectionIds: ['s1'],
    faculty: [{ id: 'f1', name: 'Demo Teacher', shortCode: 'DT' }],
    room: { id: 'r1', code: 'G16' },
    locked: false,
    ...extra,
  };
}

const week: ViewSlot[] = [
  demoSlot(1, 1, 1, 1, 'lecture', 'CS501', 'Operating Systems'),
  demoSlot(2, 1, 2, 1, 'tutorial', 'CS503', 'Theory of Computation', { locked: true }),
  demoSlot(3, 2, 2, 2, 'practical', 'CS551', 'Operating Systems Lab', {
    target: { kind: 'subgroup', id: 'g1', name: 'CSE 5A-G1' },
    room: { id: 'r2', code: 'Lab 2' },
  }),
  demoSlot(4, 2, 2, 2, 'practical', 'CS553', 'Networks Lab', {
    target: { kind: 'subgroup', id: 'g2', name: 'CSE 5A-G2' },
    room: null,
  }),
  demoSlot(5, 3, 5, 1, 'lecture', 'CS505', 'Computer Networks'),
  demoSlot(6, 5, 3, 1, 'lecture', 'CS501', 'Operating Systems'),
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

/**
 * Design-system gallery, development only: every kit component with sample data. Check it at
 * 400px and in dark mode (the OS setting) after changing the kit.
 */
export default async function UiGalleryPage() {
  if (process.env.NODE_ENV === 'production' || !isFlagOn('UI')) notFound();
  const t = await getTranslations('ui.gallery');
  return (
    <PageShell>
      <div className="flex flex-col gap-4 p-4">
        <PageHeader title={t('title')} description={t('description')} />
        <Section title={t('progress.title')}>
          <ProgressBar value={40} label={t('progress.label', { percent: 40 })} />
          <ProgressBar
            value={0}
            minVisible={3}
            label={t('progress.generating')}
            status={t('progress.status')}
          />
        </Section>
        <Section title={t('skeleton.title')}>
          <div aria-busy="true" className="flex flex-col gap-2">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </Section>
        <Section title={t('segmented.title')}>
          <SegmentedDemo />
        </Section>
        <Section title={t('slotCard.title')}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {week.slice(0, 4).map((slot) => (
              <SlotCard key={slot.id} slot={slot} kind="section" whoName="CSE 5A" />
            ))}
          </div>
        </Section>
        <Section title={t('grid.title')}>
          <TimetableGrid bell={bell} slots={week} kind="section" whoName="CSE 5A" />
        </Section>
      </div>
    </PageShell>
  );
}
