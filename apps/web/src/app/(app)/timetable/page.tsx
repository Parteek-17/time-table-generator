import { isFlagOn } from '@slotwise/shared';
import type { EditorDataDto } from '@slotwise/shared/timetable';
import { Alert, Badge, buttonVariants } from '@slotwise/ui';
import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell';
import { Problem } from '@/components/problem';
import { api } from '@/lib/api';
import { getMe } from '@/lib/me';
import { CopyButton } from './copy-button';
import { pickVersion, termsAndCurrent, versionsOf, viewOf } from './data';
import { DayView } from './day-view';
import { TimetableEditor } from './timetable-editor';
import { TimetableGrid } from './timetable-grid.local';
import { UnplacedPanel } from './unplaced-panel';
import { UrlSelect } from './url-select';
import { ViewPicker } from './view-picker';

export const metadata: Metadata = { title: 'Timetables' };

type Params = { term?: string; version?: string; kind?: string; id?: string };

/** A term's timetable: pick a version and a section, lab group, teacher or room; see the week. */
export default async function TimetablePage({ searchParams }: { searchParams: Promise<Params> }) {
  if (!isFlagOn('P2T')) notFound();
  const me = await getMe('/timetable');
  const [t, format, params] = await Promise.all([
    getTranslations('p2t'),
    getFormatter(),
    searchParams,
  ]);
  const canGenerate = me.may('timetable.edit');
  const { terms, term } = await termsAndCurrent(params.term);

  const generate = canGenerate ? (
    <Link
      href={term ? `/timetable/generate?term=${term.id}` : '/timetable/generate'}
      className={buttonVariants()}
    >
      {t('page.generate')}
    </Link>
  ) : null;
  const header = (
    <PageHeader title={t('page.title')} description={t('page.description')}>
      {term ? generate : null}
    </PageHeader>
  );

  if (!term) {
    return (
      <>
        {header}
        <Problem title={t('empty.noTermTitle')} body={t('empty.noTermBody')}>
          {me.may('term.manage') ? (
            <Link href="/terms" className={buttonVariants({ variant: 'outline' })}>
              {t('empty.noTermAction')}
            </Link>
          ) : null}
        </Problem>
      </>
    );
  }

  const termSelect = (
    <UrlSelect
      param="term"
      label={t('term')}
      value={term.id}
      reset={['version', 'kind', 'id']}
      options={terms.map((x) => ({ value: x.id, label: x.label }))}
    />
  );

  const versions = await versionsOf(term.id);
  if (!versions.ok) {
    return (
      <>
        {header}
        {termSelect}
        <Problem title={t('error.title')} body={versions.message} />
      </>
    );
  }
  const version = pickVersion(versions.data, params.version);
  if (!version) {
    return (
      <>
        {header}
        {termSelect}
        <Problem
          title={t('empty.noTimetableTitle', { term: term.label })}
          body={canGenerate ? t('empty.noTimetableEditor') : t('empty.noTimetableViewer')}
        >
          {generate}
        </Problem>
      </>
    );
  }

  const [view, editor] = await Promise.all([
    viewOf(version.id, params.kind, params.id),
    canGenerate ? api<EditorDataDto>(`/timetable/versions/${version.id}/editor`) : null,
  ]);
  const versionLabel = (v: (typeof versions.data)[number]) =>
    v.status === 'draft'
      ? t('version.draft', {
          date: format.dateTime(new Date(v.createdAt), { dateStyle: 'medium', timeStyle: 'short' }),
        })
      : t(`version.${v.status}`, { number: v.number ?? 0 });

  return (
    <>
      {header}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {termSelect}
        <UrlSelect
          param="version"
          label={t('version.label')}
          value={version.id}
          reset={[]}
          options={versions.data.map((v) => ({ value: v.id, label: versionLabel(v) }))}
        />
        <Badge>
          {t(`version.status${version.status[0]!.toUpperCase()}${version.status.slice(1)}`)}
        </Badge>
      </div>

      {version.status === 'draft' ? <Alert>{t('version.draftNote')}</Alert> : null}
      {version.status === 'archived' ? <Alert>{t('version.archivedNote')}</Alert> : null}
      {canGenerate && version.unplacedCount > 0 ? (
        <Alert variant="destructive">
          <a href="#not-placed" className="underline underline-offset-4">
            {t('version.unplaced', { count: version.unplacedCount })}
          </a>
        </Alert>
      ) : null}
      {editor?.ok && version.status !== 'draft' ? <CopyButton versionId={version.id} /> : null}

      {!view.ok ? (
        <Problem title={t('error.title')} body={view.message} />
      ) : !view.data.who ? (
        <Problem title={t('empty.nothingTitle')} body={t('empty.nothingBody')} />
      ) : (
        <>
          <ViewPicker kind={view.data.who.kind} id={view.data.who.id} choices={view.data.choices} />
          {editor?.ok && version.status === 'draft' ? (
            <TimetableEditor
              key={version.id}
              versionId={version.id}
              termId={term.id}
              data={editor.data}
              who={view.data.who}
              bell={view.data.bell}
            />
          ) : (
            <>
              <div className="hidden min-w-0 md:block">
                <TimetableGrid
                  bell={view.data.bell}
                  slots={view.data.slots}
                  kind={view.data.who.kind}
                  whoName={view.data.who.name}
                />
              </div>
              <div className="min-w-0 md:hidden">
                <DayView
                  bell={view.data.bell}
                  slots={view.data.slots}
                  kind={view.data.who.kind}
                  whoName={view.data.who.name}
                />
              </div>
            </>
          )}
          {editor?.ok ? (
            <section id="not-placed" className="scroll-mt-4">
              <UnplacedPanel
                unplaced={editor.data.unplaced}
                snapshot={editor.data.snapshot}
                termId={term.id}
              />
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
