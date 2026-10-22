import {
  buildBellSchedule,
  DEFAULT_BELL,
  type BellScheduleInput,
  type BellScheduleRow,
  type ProgrammeRow,
} from '@slotwise/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell';
import { api } from '@/lib/api';
import { getMe, list } from '@/lib/me';
import { BellEditor } from './bell-editor';

export const metadata: Metadata = { title: 'Bell schedule' };

export default async function BellSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe(`/bell-schedules/${id}`);
  const t = await getTranslations('bell');
  const [existing, programmes, all] = await Promise.all([
    id === 'new'
      ? Promise.resolve(null)
      : api<BellScheduleRow>(`/bell-schedules/${encodeURIComponent(id)}`),
    list<ProgrammeRow>('/programmes'),
    list<BellScheduleRow>('/bell-schedules'),
  ]);
  if (existing && !existing.ok) notFound();
  const initial: BellScheduleInput = existing?.ok
    ? existing.data
    : {
        name: all.length === 0 ? t('defaultName') : '',
        workingDays: [...DEFAULT_BELL.workingDays],
        isDefault: all.length === 0,
        periods: buildBellSchedule(DEFAULT_BELL),
        breaks: DEFAULT_BELL.breaks.map((b) => ({ ...b })),
        programmes: [],
      };
  return (
    <>
      <PageHeader
        title={existing?.ok ? existing.data.name : t('add')}
        description={t('editorHint')}
      />
      <BellEditor
        id={existing?.ok ? existing.data.id : null}
        initial={initial}
        programmes={programmes.map((p) => ({ value: p.id, label: p.name }))}
        canManage={me.may('calendar.manage')}
      />
    </>
  );
}
