import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

/** Link that shows or hides archived rows (?archived=1). */
export async function ArchivedToggle({ showing, base = '' }: { showing: boolean; base?: string }) {
  const t = await getTranslations('entity');
  const join = base.includes('?') ? '&' : '?';
  return (
    <Link
      href={showing ? base || '?' : `${base}${join}archived=1`}
      className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-primary underline-offset-4 hover:underline"
    >
      {showing ? t('hideArchived') : t('showArchived')}
    </Link>
  );
}
