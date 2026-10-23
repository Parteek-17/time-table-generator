import { isFlagOn } from '@slotwise/shared';
import { getTranslations } from 'next-intl/server';
import type { NavSource } from './types';

/** Rescheduling. Placeholder from C0: P4 decides who sees it (me.may(...)). */
const nav: NavSource = async () => {
  if (!isFlagOn('P4')) return [];
  const t = await getTranslations('p4.nav');
  return [{ items: [{ href: '/reschedule', label: t('reschedule') }] }];
};

export default nav;
