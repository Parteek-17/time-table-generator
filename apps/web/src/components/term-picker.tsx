'use client';

import type { TermRow } from '@slotwise/shared';
import { Label, NativeSelect } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId } from 'react';

/** Switches the term of a term-bound page (?term=<id>). The current term is marked. */
export function TermPicker({ terms, current }: { terms: TermRow[]; current: string }) {
  const t = useTranslations('terms');
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (terms.length < 2) return null;
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="whitespace-nowrap">
        {t('term')}
      </Label>
      <NativeSelect
        id={id}
        value={current}
        className="w-auto"
        onChange={(e) => {
          const next = new URLSearchParams(params);
          next.set('term', e.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
      >
        {terms.map((term) => (
          <option key={term.id} value={term.id}>
            {term.status === 'active' ? t('currentLabel', { label: term.label }) : term.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
