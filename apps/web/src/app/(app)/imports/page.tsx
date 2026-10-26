import { IMPORT_TEMPLATES, type ImportJobDto } from '@slotwise/shared';
import {
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from '@slotwise/ui';
import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageHeader } from '@/components/app-shell';
import { Problem } from '@/components/problem';
import { api } from '@/lib/api';
import { getMe } from '@/lib/me';
import { KIND_ORDER } from './kinds';
import { StatusBadge } from './status-badge';

export const metadata: Metadata = { title: 'Import from Excel' };

/** Templates for each kind, upload, and the recent imports (milestone 1d). */
export default async function ImportsPage() {
  const me = await getMe('/imports');
  const t = await getTranslations('p1.imports');
  if (!me.may('import.run')) return <Problem title={t('title')} body={t('notAllowed')} />;
  const [res, format] = await Promise.all([api<ImportJobDto[]>('/imports'), getFormatter()]);

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />

      <section aria-labelledby="kinds-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="kinds-heading" className="text-lg font-semibold">
            {t('kindsHeading')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('orderHint')}</p>
        </div>
        <ol className="grid gap-3 md:grid-cols-2">
          {KIND_ORDER.map((kind, i) => {
            const title = t(`kind.${kind}.title`);
            return (
              <li key={kind}>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="text-base">
                      <span className="text-muted-foreground">{i + 1}. </span>
                      {title}
                    </CardTitle>
                    <CardDescription>{t(`kind.${kind}.hint`)}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Link
                      href={`/imports/new?kind=${kind}`}
                      aria-label={t('uploadFor', { kind: title })}
                      className={buttonVariants({ size: 'sm' })}
                    >
                      {t('upload')}
                    </Link>
                    <a
                      href={`/imports/templates/${kind}`}
                      download
                      aria-label={t('downloadTemplateFor', { kind: title })}
                      className={buttonVariants({ size: 'sm', variant: 'outline' })}
                    >
                      {t('downloadTemplate')}
                    </a>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="recent-heading" className="flex flex-col gap-3">
        <h2 id="recent-heading" className="text-lg font-semibold">
          {t('recentHeading')}
        </h2>
        {!res.ok ? (
          <p role="alert" className="text-sm text-destructive">
            {res.message}
          </p>
        ) : res.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('recentNone')}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {res.data.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="truncate font-medium">{job.fileName}</p>
                  <p className="text-sm text-muted-foreground">
                    {IMPORT_TEMPLATES[job.kind].title} · {t('rows', { count: job.rowCount })} ·{' '}
                    {t('by', {
                      name: job.createdByName ?? '',
                      date: format.dateTime(new Date(job.createdAt), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }),
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={job.status} />
                  <Link
                    href={`/imports/${job.id}`}
                    aria-label={t('openLabel', { file: job.fileName })}
                    className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
                  >
                    {t('open')}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
