import { isFlagOn } from '@slotwise/shared';
import { getTranslations } from 'next-intl/server';
import type { NavSource } from './types';

/** Timetables. Placeholder from C0: P2T decides who sees it (me.may(...)). */
const nav: NavSource = async () => {
  if (!isFlagOn('P2T')) return [];
  const t = await getTranslations('p2t.nav');
  return [{ label: t('group'), items: [{ href: '/timetable', label: t('timetables') }] }];
};

export default nav;
