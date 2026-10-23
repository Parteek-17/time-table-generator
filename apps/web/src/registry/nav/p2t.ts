import { isFlagOn } from '@slotwise/shared';
import { getTranslations } from 'next-intl/server';
import type { NavSource } from './types';

/** Timetables for everyone who may read them; Generate for those who may edit them. */
const nav: NavSource = async (me) => {
  if (!isFlagOn('P2T') || !me.may('timetable.view')) return [];
  const t = await getTranslations('p2t.nav');
  const items = [{ href: '/timetable', label: t('timetables') }];
  if (me.may('timetable.edit')) items.push({ href: '/timetable/generate', label: t('generate') });
  return [{ label: t('group'), items }];
};

export default nav;
