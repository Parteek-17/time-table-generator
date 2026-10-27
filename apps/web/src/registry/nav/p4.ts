import { isFlagOn } from '@slotwise/shared';
import { getTranslations } from 'next-intl/server';
import type { NavSource } from './types';

/** Changes and make-ups, and syllabus coverage, for everyone who reads timetables. */
const nav: NavSource = async (me) => {
  if (!isFlagOn('P4') || !me.may('timetable.view')) return [];
  const t = await getTranslations('p4.nav');
  return [
    {
      label: t('group'),
      items: [
        { href: '/reschedule', label: t('reschedule') },
        { href: '/reschedule/coverage', label: t('coverage') },
      ],
    },
  ];
};

export default nav;
