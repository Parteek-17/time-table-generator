'use client';

import {
  exportTable,
  tableToCsv,
  type ExportFormat,
  type ExportLabels,
  type GridBell,
  type ViewKind,
  type ViewSlot,
} from '@slotwise/shared/timetable';
import { Alert, Button } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { freshWeek } from './actions';

type Status = { kind: 'ok' | 'error'; text: string } | null;

/**
 * PDF and Excel downloads of the week on screen (or every section, teacher … as Excel), and
 * "Copy as CSV" built in the browser from the same table model the files use.
 */
export function Downloads({
  versionId,
  draft,
  who,
  bell,
  slots,
}: {
  versionId: string;
  /** Drafts change while the page is open: Copy as CSV reads the saved week first. */
  draft: boolean;
  who: { kind: ViewKind; id: string; name: string };
  bell: GridBell;
  slots: ViewSlot[];
}) {
  const t = useTranslations('p2t');
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function download(format: ExportFormat, id: string | null) {
    const key = `${format}:${id ?? 'all'}`;
    setBusy(key);
    setStatus(null);
    try {
      const params = new URLSearchParams({ version: versionId, format, kind: who.kind });
      if (id) params.set('id', id);
      const res = await fetch(`/timetable/export?${params}`);
      if (!res.ok) {
        setStatus({ kind: 'error', text: t('export.failed', { message: await res.text() }) });
        return;
      }
      const name =
        /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ??
        `timetable.${format}`;
      const href = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = href;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch {
      setStatus({ kind: 'error', text: t('export.failed', { message: t('error.title') }) });
    } finally {
      setBusy(null);
    }
  }

  async function copyCsv() {
    const labels: ExportLabels = {
      day: t('grid.day'),
      days: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, t(`days.long.${d}`)])),
      tag: {
        lecture: t('grid.tag.lecture'),
        tutorial: t('grid.tag.tutorial'),
        practical: t('grid.tag.practical'),
      },
      noRoom: t('grid.noRoom'),
    };
    try {
      let week = { bell, slots };
      if (draft) {
        const fresh = await freshWeek(versionId, who.kind, who.id);
        if (!fresh.ok) throw new Error(fresh.message);
        week = fresh;
      }
      await navigator.clipboard.writeText(tableToCsv(exportTable(week, who, labels)));
      setStatus({ kind: 'ok', text: t('export.copied') });
    } catch {
      setStatus({ kind: 'error', text: t('export.copyFailed') });
    }
  }

  return (
    <section aria-labelledby="downloads-title" className="flex flex-col gap-2">
      <h2 id="downloads-title" className="text-sm font-medium">
        {t('export.title')}
      </h2>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null}
          aria-label={t('export.pdfLabel', { name: who.name })}
          onClick={() => download('pdf', who.id)}
        >
          {t('export.pdf')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null}
          aria-label={t('export.xlsxLabel', { name: who.name })}
          onClick={() => download('xlsx', who.id)}
        >
          {t('export.xlsx')}
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-label={t('export.csvLabel', { name: who.name })}
          onClick={copyCsv}
        >
          {t('export.csv')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy !== null}
          aria-label={t('export.allLabel', { kind: who.kind })}
          onClick={() => download('xlsx', null)}
        >
          {t('export.all', { kind: who.kind })} · {t('export.xlsx')}
        </Button>
      </div>
      {status ? (
        <Alert variant={status.kind === 'error' ? 'destructive' : 'success'} role="status">
          {status.text}
        </Alert>
      ) : null}
    </section>
  );
}
