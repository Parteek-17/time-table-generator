import { isFlagOn } from '@slotwise/shared';
import { getTranslations } from 'next-intl/server';
import type { NavSource } from './types';

/**
 * "My timetable" (Today, Week) for everyone who reads timetables. Whether they are a student
 * or teacher is decided by the API from their records; others see a plain "not linked" note.
 */
const nav: NavSource = async (me) => {
  if (!isFlagOn('P5') || !me.may('timetable.view')) return [];
  const t = await getTranslations('p5.nav');
  return [
    {
      label: t('group'),
      items: [
        { href: '/today', label: t('today') },
        { href: '/week', label: t('week') },
      ],
    },
  ];
};

export default nav;
