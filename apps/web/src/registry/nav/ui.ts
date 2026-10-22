import { isFlagOn } from '@slotwise/shared';
import { getTranslations } from 'next-intl/server';
import type { NavSource } from './types';

/** UI gallery link, development only. */
const nav: NavSource = async () => {
  if (process.env.NODE_ENV === 'production' || !isFlagOn('UI')) return [];
  const t = await getTranslations('ui.nav');
  return [{ items: [{ href: '/ui', label: t('gallery') }] }];
};

export default nav;
