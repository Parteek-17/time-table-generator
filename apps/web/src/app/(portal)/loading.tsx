import { getTranslations } from 'next-intl/server';

/** Shown while the timetable loads (slow connections): a few grey blocks and a spoken label. */
export default async function PortalLoading() {
  const t = await getTranslations('p5.common');
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">{t('loading')}</span>
      <div className="h-12 rounded-lg bg-muted motion-safe:animate-pulse" />
      <div className="h-8 w-2/3 rounded-md bg-muted motion-safe:animate-pulse" />
      <div className="h-28 rounded-lg bg-muted motion-safe:animate-pulse" />
      <div className="h-20 rounded-lg bg-muted motion-safe:animate-pulse" />
      <div className="h-20 rounded-lg bg-muted motion-safe:animate-pulse" />
    </div>
  );
}
