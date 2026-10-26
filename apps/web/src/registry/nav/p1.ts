import { getTranslations } from 'next-intl/server';
import type { NavSource } from './types';

/** Institute setup and people (master data). */
const nav: NavSource = async (me) => {
  if (!me.may('masterdata.view')) return [];
  const [t, tSetup] = await Promise.all([getTranslations('nav'), getTranslations('p1.setup')]);
  return [
    {
      label: t('setup'),
      items: [
        { href: '/setup', label: tSetup('navLabel') },
        { href: '/settings/institute', label: t('institute') },
        { href: '/departments', label: t('departments') },
        { href: '/programmes', label: t('programmes') },
        { href: '/schemes', label: t('schemes') },
        { href: '/terms', label: t('terms') },
        { href: '/calendar', label: t('calendar') },
        { href: '/bell-schedules', label: t('bellSchedules') },
        ...(me.may('import.run') ? [{ href: '/imports', label: t('imports') }] : []),
      ],
    },
    {
      label: t('people'),
      items: [
        { href: '/batches', label: t('batches') },
        { href: '/cohorts', label: t('cohorts') },
        { href: '/students', label: t('students') },
        { href: '/faculty', label: t('faculty') },
        { href: '/rooms', label: t('rooms') },
      ],
    },
  ];
};

export default nav;
