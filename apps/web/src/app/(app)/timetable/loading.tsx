import { useTranslations } from 'next-intl';

/** Shape of the timetable page while it loads: header, pickers, then a grid or day list. */
export default function TimetableLoading() {
  const t = useTranslations('p2t.page');
  const block = 'animate-pulse rounded-lg bg-muted motion-reduce:animate-none';
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <div className="flex flex-wrap gap-3">
        <div className={`${block} h-11 w-48`} />
        <div className={`${block} h-11 w-56`} />
      </div>
      <div className={`${block} h-11 w-full max-w-md`} />
      <div className="hidden grid-cols-8 gap-1 md:grid">
        {Array.from({ length: 40 }, (_, i) => (
          <div key={i} className={`${block} h-20`} />
        ))}
      </div>
      <div className="flex flex-col gap-2 md:hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`${block} h-16`} />
        ))}
      </div>
    </div>
  );
}
