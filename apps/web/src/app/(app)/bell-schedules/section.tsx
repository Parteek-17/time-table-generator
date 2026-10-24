import {
  buildBellSchedule,
  DEFAULT_BELL,
  type BellScheduleInput,
  type BellScheduleRow,
  type ProgrammeRow,
} from '@slotwise/shared';
import { getTranslations } from 'next-intl/server';
import { getMe, list } from '@/lib/me';
import { BellEditor } from './[id]/bell-editor';

/**
 * The default bell schedule, ready to edit, or a new one pre-filled with the usual day
 * (09:00, 50-minute periods, lunch after P4). Used by the setup wizard's bell step.
 */
export async function DefaultBellSection() {
  const me = await getMe('/bell-schedules');
  const t = await getTranslations('bell');
  const [schedules, programmes] = await Promise.all([
    list<BellScheduleRow>('/bell-schedules'),
    list<ProgrammeRow>('/programmes'),
  ]);
  const existing = schedules.find((s) => s.isDefault) ?? null;
  const initial: BellScheduleInput = existing ?? {
    name: t('defaultName'),
    workingDays: [...DEFAULT_BELL.workingDays],
    isDefault: true,
    periods: buildBellSchedule(DEFAULT_BELL),
    breaks: DEFAULT_BELL.breaks.map((b) => ({ ...b })),
    programmes: [],
  };
  return (
    <BellEditor
      id={existing?.id ?? null}
      initial={initial}
      programmes={programmes.map((p) => ({ value: p.id, label: p.name }))}
      canManage={me.may('calendar.manage')}
      stayOnSave
    />
  );
}
