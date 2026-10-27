'use client';

import { VIEW_KINDS, type ViewChoice, type ViewKind } from '@slotwise/shared/timetable';
import { cn, Label, NativeSelect } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId } from 'react';

/**
 * Which week to show: section, lab group, teacher or room, then which one. Kept in the URL
 * (?kind=&id=) so a view can be shared or bookmarked.
 */
export function ViewPicker({
  kind,
  id,
  choices,
}: {
  kind: ViewKind;
  id: string | null;
  choices: Record<ViewKind, ViewChoice[]>;
}) {
  const t = useTranslations('p2t.view');
  const selectId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (nextKind: ViewKind, nextId: string | null) => {
    const next = new URLSearchParams(params);
    next.set('kind', nextKind);
    if (nextId) next.set('id', nextId);
    else next.delete('id');
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div
        role="group"
        aria-label={t('show')}
        className="grid grid-cols-4 gap-1 rounded-lg border p-1"
      >
        {VIEW_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === kind}
            disabled={choices[k].length === 0}
            onClick={() => go(k, choices[k][0]?.id ?? null)}
            className={cn(
              'h-9 rounded-md px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
              k === kind ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
            )}
          >
            {t(`kind.${k}`)}
          </button>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Label htmlFor={selectId}>{t(`kind.${kind}`)}</Label>
        <NativeSelect id={selectId} value={id ?? ''} onChange={(e) => go(kind, e.target.value)}>
          {choices[kind].map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}
