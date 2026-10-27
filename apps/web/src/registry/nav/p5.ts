import { isFlagOn } from '@slotwise/shared';
import { getTranslations } from 'next-intl/server';
import type { NavSource } from './types';

/**
 * "My timetable" (Today, Week, Add to calendar) for everyone who reads timetables. Whether
 * they are a student or teacher is decided by the API from their records; others see a plain
 * "not linked" note. Notice-board links for those who publish timetables.
 */
const nav: NavSource = async (me) => {
  if (!isFlagOn('P5') || !me.may('timetable.view')) return [];
  const t = await getTranslations('p5.nav');
  const items = [
    { href: '/today', label: t('today') },
    { href: '/week', label: t('week') },
    { href: '/add-to-calendar', label: t('calendar') },
  ];
  if (me.may('timetable.publish')) items.push({ href: '/share', label: t('share') });
  return [{ label: t('group'), items }];
};

export default nav;
