'use client';

import { Alert, Badge, Button, Input, Label } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { useId, useMemo, useState, useTransition, type ReactNode } from 'react';
import { archiveEntity, restoreEntity } from '@/lib/entity-actions';

export interface ListRow {
  id: string;
  archivedAt: string | null;
}

interface Notice {
  text: string;
  undoId?: string;
  error?: boolean;
}

export interface EntityListProps<R extends ListRow> {
  rows: R[];
  /** API collection, e.g. "/rooms". */
  path: string;
  revalidate: string;
  /** Main line of a row. */
  title: (row: R) => ReactNode;
  /** Second line (muted). */
  subtitle?: (row: R) => ReactNode;
  /** Name used in "Archived G16." messages and button labels. */
  name: (row: R) => string;
  /** Text matched by the search box; omit to hide search. */
  searchText?: (row: R) => string;
  canEdit?: (row: R) => boolean;
  /** Edit form shown in place of the row. */
  edit?: (row: R, close: () => void) => ReactNode;
  /** Extra buttons or links for a row. */
  actions?: (row: R) => ReactNode;
  empty: string;
}

/**
 * A searchable list of rows. Archive is instant with an Undo (CLAUDE.md "Undo instead of
 * confirm"); archived rows (when the page asks for them) can be restored.
 */
export function EntityList<R extends ListRow>({
  rows,
  path,
  revalidate,
  title,
  subtitle,
  name,
  searchText,
  canEdit = () => true,
  edit,
  actions,
  empty,
}: EntityListProps<R>) {
  const t = useTranslations('entity');
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, startTransition] = useTransition();

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !searchText) return rows;
    return rows.filter((r) => searchText(r).toLowerCase().includes(q));
  }, [rows, query, searchText]);

  function archive(row: R) {
    startTransition(async () => {
      const res = await archiveEntity(path, row.id, revalidate);
      setNotice(
        res.ok
          ? { text: t('archived', { name: name(row) }), undoId: row.id }
          : { text: res.message ?? '', error: true },
      );
    });
  }

  function restore(id: string, label?: string) {
    startTransition(async () => {
      const res = await restoreEntity(path, id, revalidate);
      setNotice(
        res.ok
          ? { text: label ? t('restoredNamed', { name: label }) : t('restored') }
          : { text: res.message ?? '', error: true },
      );
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {searchText && rows.length > 5 ? (
        <div className="flex flex-col gap-2 sm:max-w-sm">
          <Label htmlFor={searchId}>{t('search')}</Label>
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      ) : null}

      <div aria-live="polite">
        {notice ? (
          <Alert
            variant={notice.error ? 'destructive' : 'default'}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span>{notice.text}</span>
            {notice.undoId ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => restore(notice.undoId!)}
              >
                {t('undo')}
              </Button>
            ) : null}
          </Alert>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <p className="text-muted-foreground">{query ? t('noMatches') : empty}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border">
          {shown.map((row) => {
            const label = name(row);
            const editable = canEdit(row);
            if (editing === row.id && edit) {
              return (
                <li key={row.id} className="p-3 sm:p-4">
                  <p className="mb-3 font-medium">{t('editing', { name: label })}</p>
                  {edit(row, () => setEditing(null))}
                </li>
              );
            }
            return (
              <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {title(row)}
                    {row.archivedAt ? <Badge className="ml-2">{t('archivedBadge')}</Badge> : null}
                  </p>
                  {subtitle ? (
                    <div className="text-sm text-muted-foreground">{subtitle(row)}</div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {actions?.(row)}
                  {row.archivedAt ? (
                    editable ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => restore(row.id, label)}
                      >
                        {t('restore')}
                      </Button>
                    ) : null
                  ) : (
                    <>
                      {edit && editable ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing(row.id)}
                          aria-label={t('editLabel', { name: label })}
                        >
                          {t('edit')}
                        </Button>
                      ) : null}
                      {editable ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => archive(row)}
                          aria-label={t('archiveLabel', { name: label })}
                        >
                          {t('archive')}
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** "Add …" button that opens a form in place (one task per screen, no dialogs). */
export function AddPanel({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: (close: () => void) => ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const t = useTranslations('entity');
  if (!open) {
    return (
      <Button className="self-start" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <section className="rounded-xl border p-4" aria-label={label}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{label}</h2>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t('close')}
        </Button>
      </div>
      {children(() => setOpen(false))}
    </section>
  );
}
