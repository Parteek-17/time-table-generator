import { getTranslations } from 'next-intl/server';
import type { NavGroup, NavSource } from './types';

/** Home, always first. */
export const coreTop: NavSource = async () => {
  const t = await getTranslations('nav');
  return [{ items: [{ href: '/', label: t('home') }] }];
};

/** "More": my availability, members, audit log. Always last. */
export const coreMore: NavSource = async (me) => {
  const t = await getTranslations('nav');
  const items: NavGroup['items'] = [];
  if (me.may('faculty.availability.edit'))
    items.push({ href: '/me/availability', label: t('myAvailability') });
  if (me.may('member.view')) items.push({ href: '/members', label: t('members') });
  if (me.may('audit.view')) items.push({ href: '/audit', label: t('audit') });
  return items.length > 0 ? [{ label: t('more'), items }] : [];
};
