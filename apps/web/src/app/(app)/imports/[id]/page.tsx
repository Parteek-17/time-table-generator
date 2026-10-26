import {
  IMPORT_TEMPLATES,
  importRowsQuerySchema,
  type ImportJobDto,
  type ImportRowsPageDto,
} from '@slotwise/shared';
import { Alert, buttonVariants, Card, CardContent, cn } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell';
import { Problem } from '@/components/problem';
import { api } from '@/lib/api';
import { getMe } from '@/lib/me';
import { ProgressBar } from '../../setup/progress.local';
import { KIND_PAGE } from '../kinds';
import { StatusBadge } from '../status-badge';
import { AutoRefresh, CancelButton, CommitBar } from './job-actions';
import { MappingForm } from './mapping-form';
import { RowsList } from './rows-list';

export const metadata: Metadata = { title: 'Import' };

const SHOWS = ['all', 'problems', 'create', 'update', 'unchanged', 'skip'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** One import: reading → columns → preview with fixes → commit → summary. */
export default async function ImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ show?: string; page?: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const me = await getMe(`/imports/${id}`);
  const t = await getTranslations('p1.imports');
  const res = await api<ImportJobDto>(`/imports/${id}`);
  if (!res.ok) {
    if (res.status === 404) notFound();
    return <Problem title={t('title')} body={res.message} />;
  }
  const job = res.data;
  const kindTitle = t(`kind.${job.kind}.title`);
  const sp = await searchParams;
  const changingColumns = job.status === 'preview' && sp.show === 'columns';
  const query = importRowsQuerySchema.safeParse({
    show: changingColumns ? 'all' : (sp.show ?? (job.counts.problems > 0 ? 'problems' : 'all')),
    page: sp.page ?? '1',
  });
  const { show, page } = query.success ? query.data : { show: 'all' as const, page: 1 };
  const hasRows = job.status === 'preview' || job.status === 'committed';
  const rowsRes = hasRows
    ? await api<ImportRowsPageDto>(`/imports/${id}/rows?show=${show}&page=${page}`)
    : null;
  const busy = job.status === 'parsing' || job.status === 'committing' || job.status === 'uploaded';
  const editable = job.status === 'preview' && me.may('import.run');
  const columns = IMPORT_TEMPLATES[job.kind].columns.map((c) => ({
    key: c.key,
    label: c.label,
    required: Boolean(c.required),
  }));
  const rowsLink = (s: string, p = 1) => `/imports/${job.id}?show=${s}${p > 1 ? `&page=${p}` : ''}`;

  return (
    <>
      <PageHeader
        title={`${kindTitle}: ${job.fileName}`}
        description={t('rows', { count: job.rowCount })}
      >
        <StatusBadge status={job.status} />
      </PageHeader>

      {busy ? (
        <Card>
          <CardContent className="flex flex-col gap-2 pt-6">
            <p aria-live="polite">
              {job.status === 'committing'
                ? t('committingBody')
                : t('reading', { count: job.rowCount })}
            </p>
            <ProgressBar value={job.progress} label={t('progress', { percent: job.progress })} />
            <AutoRefresh />
          </CardContent>
        </Card>
      ) : null}

      {job.summary.error && job.status !== 'committed' ? (
        <Alert variant="destructive" role="alert">
          <p className="font-medium">
            {job.status === 'failed' ? t('failedTitle') : t('commitFailed')}
          </p>
          <p>{job.summary.error}</p>
        </Alert>
      ) : null}

      {job.status === 'mapping' || changingColumns ? (
        <MappingForm
          jobId={job.id}
          headers={job.headers}
          mapping={job.mapping}
          columns={columns}
          missing={job.missingRequired}
        />
      ) : null}

      {job.status === 'committed' ? (
        <Alert variant="success">
          <p className="font-medium">{t('doneTitle')}</p>
          <p>
            {t('doneBody', {
              created: job.summary.created,
              updated: job.summary.updated,
              unchanged: job.summary.unchanged,
              skipped: job.summary.skipped,
            })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={KIND_PAGE[job.kind]} className={buttonVariants({ size: 'sm' })}>
              {t('openPage', { page: kindTitle })}
            </Link>
            <Link href="/imports" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
              {t('importAnother')}
            </Link>
            <Link href="/setup" className={buttonVariants({ size: 'sm', variant: 'ghost' })}>
              {t('backToSetup')}
            </Link>
          </div>
        </Alert>
      ) : null}

      {job.status === 'cancelled' || job.status === 'failed' ? (
        <div className="flex flex-col gap-3">
          {job.status === 'cancelled' ? <p>{t('cancelledBody')}</p> : null}
          <div>
            <Link href={`/imports/new?kind=${job.kind}`} className={buttonVariants()}>
              {t('uploadAgain')}
            </Link>
          </div>
        </div>
      ) : null}

      {job.status === 'preview' && !changingColumns ? (
        <CommitBar
          jobId={job.id}
          problems={job.counts.problems}
          toImport={job.counts.create + job.counts.update}
        />
      ) : null}

      {rowsRes && !changingColumns ? (
        <section aria-labelledby="rows-heading" className="flex flex-col gap-3">
          <h2 id="rows-heading" className="sr-only">
            {t('filterLabel')}
          </h2>
          <nav aria-label={t('filterLabel')} className="flex flex-wrap gap-1">
            {SHOWS.map((s) => {
              const count =
                s === 'all' ? job.rowCount : s === 'problems' ? job.counts.problems : job.counts[s];
              if (s !== 'all' && count === 0) return null;
              return (
                <Link
                  key={s}
                  href={rowsLink(s)}
                  aria-current={s === show ? 'page' : undefined}
                  className={cn(
                    buttonVariants({ size: 'sm', variant: s === show ? 'secondary' : 'ghost' }),
                    s === 'problems' && 'text-destructive',
                  )}
                >
                  {t(`show.${s}`)} ({count})
                </Link>
              );
            })}
            {editable ? (
              <Link
                href={`/imports/${job.id}?show=columns`}
                className={buttonVariants({ size: 'sm', variant: 'link' })}
              >
                {t('columnsLink')}
              </Link>
            ) : null}
          </nav>
          {rowsRes.ok ? (
            <>
              <RowsList
                jobId={job.id}
                rows={rowsRes.data.rows}
                columns={columns}
                editable={editable}
              />
              {rowsRes.data.pageCount > 1 ? (
                <div className="flex items-center justify-between gap-2">
                  {rowsRes.data.page > 1 ? (
                    <Link
                      href={rowsLink(show, rowsRes.data.page - 1)}
                      className={buttonVariants({ size: 'sm', variant: 'outline' })}
                    >
                      {t('prev')}
                    </Link>
                  ) : (
                    <span />
                  )}
                  <span className="text-sm text-muted-foreground">
                    {t('pageOf', { page: rowsRes.data.page, pages: rowsRes.data.pageCount })}
                  </span>
                  {rowsRes.data.page < rowsRes.data.pageCount ? (
                    <Link
                      href={rowsLink(show, rowsRes.data.page + 1)}
                      className={buttonVariants({ size: 'sm', variant: 'outline' })}
                    >
                      {t('next')}
                    </Link>
                  ) : (
                    <span />
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <p role="alert" className="text-sm text-destructive">
              {rowsRes.message}
            </p>
          )}
        </section>
      ) : null}

      {editable || job.status === 'mapping' ? <CancelButton jobId={job.id} /> : null}
    </>
  );
}
