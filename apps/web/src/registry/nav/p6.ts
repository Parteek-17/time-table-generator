import { isFlagOn } from '@slotwise/shared';
import { getTranslations } from 'next-intl/server';
import type { NavSource } from './types';

/** Exam seating. Placeholder from C0: P6 decides who sees it (me.may(...)). */
const nav: NavSource = async () => {
  if (!isFlagOn('P6')) return [];
  const t = await getTranslations('p6.nav');
  return [{ items: [{ href: '/exams', label: t('exams') }] }];
};

export default nav;
